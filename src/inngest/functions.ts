import { switchChannel } from './channels/switch';
import { calculatorChannel } from './channels/calculator';
import { geminiChannel } from "./channels/gemini";
import { inngest } from "./client";
import { NonRetriableError } from "inngest";
import { CronExpressionParser } from "cron-parser";
import { buildGraph, runWorkflowGraph } from "./engine";
import {
  ExecutionStatus,
  NodeType,
  Prisma,
} from "@prisma/client";

import { getExecutor } from "@/features/executions/lib/executor-registry";
import type {
  NodeWithCredential,
  WorkflowContext,
} from "@/features/executions/types";

import { httpRequestChannel } from "./channels/http-request";
import { manualTriggerChannel } from "./channels/manual-trigger";
import { googleFormTriggerChannel } from "./channels/google-form-trigger";
import { stripeTriggerChannel } from "./channels/stripe-trigger";

import { openaiChannel } from "./channels/openai";
import { anthropicChannel } from "./channels/anthropic";

import { discordChannel } from "./channels/discord";
import { slackChannel } from "./channels/slack";

import prisma from "@/lib/db";

import { PLAN_LIMITS } from "@/config/plans";

import { webhookChannel } from "./channels/webhookResponse";
import { filterChannel } from "./channels/filter";
import { delayChannel } from "./channels/delay";
import { emailChannel } from "./channels/email";
import { googleSheetsChannel } from "./channels/googleSheet";
import { scheduleTriggerChannel } from "./channels/schedule-trigger";
import { codeChannel } from "./channels/code";
import { aiAgentChannel } from "./channels/ai-agent";
import { bufferMemoryChannel } from "./channels/bufferMemory";
import { googleCalendarChannel } from "./channels/googleCalendar";
import { notionChannel } from "./channels/notion";
import { telegramChannel } from "./channels/telegram";
import { dateTimeChannel } from "./channels/datetime";
import { textFormatterChannel } from "./channels/textformatter";

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

// =========================================================================
// 1. ENGINE EXECUTOR: Runs a single execution instance from start to finish
// =========================================================================
export const executeWorkflow =
  inngest.createFunction(
    {
      id: "execute-workflow",

      retries:
        process.env.NODE_ENV ===
          "production"
          ? 3
          : 0,

      onFailure: async ({
        event,
      }) => {
        try {
          const executionId = event.data.event.data.executionId;

          // Fetch execution to calculate duration if available
          const exec = await prisma.execution.findUnique({
            where: { id: executionId },
            select: { startedAt: true }
          });

          if (!exec) return;

          await prisma.execution.update({
            where: { id: executionId },
            data: {
              status: ExecutionStatus.FAILED,
              error: event.data.error?.message ?? "Unknown workflow error",
              errorStack: event.data.error?.stack,
              completedAt: new Date(),
              durationMs: Date.now() - new Date(exec.startedAt).getTime(), // Capture total duration on global failure
            },
          });
        } catch (err) {
          console.error(
            "Failed to update execution on failure",
            err
          );
        }
      },
    },

    {
      event:
        "workflows/execute.workflow",

      channels: [
        httpRequestChannel(),
        manualTriggerChannel(),
        googleFormTriggerChannel(),
        stripeTriggerChannel(),
        scheduleTriggerChannel(),

        geminiChannel(),
        openaiChannel(),
        anthropicChannel(),

        discordChannel(),
        slackChannel(),

        webhookChannel(),
        filterChannel(),
        delayChannel(),
        emailChannel(),
        googleSheetsChannel(),
        codeChannel(),
        aiAgentChannel(),
        bufferMemoryChannel(),
        googleCalendarChannel(),
        notionChannel(),
        telegramChannel(),
        dateTimeChannel(),
        textFormatterChannel(),
        calculatorChannel(),
        switchChannel()
      ],
    },

    async ({ event, step }) => {
      const inngestEventId = event.id;
      const workflowId = event.data.workflowId;
      const executionId = event.data.executionId;

      if (!inngestEventId || !workflowId || !executionId) {
        throw new NonRetriableError(
          "Workflow ID or execution ID is missing"
        );
      }

      // Everything that touches the database runs inside a step. Inngest
      // re-runs this function body after every step, so writes made outside
      // of one would be repeated on each replay.

      // =========================================
      // FIND EXECUTION
      // =========================================

      const execution = await step.run("init-execution", async () => {
        const found = await prisma.execution.findUnique({
          where: { id: executionId },
        });

        if (!found || found.workflowId !== workflowId) {
          throw new NonRetriableError(
            `Execution ${executionId} not found for workflow ${workflowId}`
          );
        }

        await prisma.execution.update({
          where: { id: found.id },
          data: { inngestEventId },
        });

        return {
          id: found.id,
          startedAt: found.startedAt.toISOString(),
        };
      });

      // =========================================
      // PREPARE WORKFLOW
      // =========================================

      const { allNodes, connections, userId, userPlan } = await step.run(
        "prepare-workflow",
        async () => {
          const workflow = await prisma.workflow.findUniqueOrThrow({
            where: {
              id: workflowId,
            },
            include: {
              nodes: {
                include: {
                  credential: true,
                },
              },
              connections: true,
              user: {
                select: {
                  plan: true, // Dynamically fetch user's subscription tier
                },
              },
            },
          });

          return {
            allNodes: workflow.nodes,
            connections: workflow.connections, // We need this to trace cables!
            userId: workflow.userId,
            userPlan: workflow.user.plan,
          };
        }
      );

      // =========================================
      // DYNAMIC PLAN LIMIT CHECK
      // =========================================

      await step.run(
        "check-monthly-execution-limit",
        async () => {
          const startOfMonth = new Date();
          startOfMonth.setDate(1);
          startOfMonth.setHours(0, 0, 0, 0);

          const executionsThisMonth = await prisma.execution.count({
            where: {
              workflow: {
                userId,
              },
              startedAt: {
                gte: startOfMonth,
              },
            },
          });

          // Get exact limit for this user's current tier
          const allowedExecutions =
            PLAN_LIMITS[userPlan]?.monthlyExecutions ??
            PLAN_LIMITS.FREE.monthlyExecutions;

          // The count already includes this execution
          if (executionsThisMonth > allowedExecutions) {
            throw new NonRetriableError(
              `Monthly execution limit reached. Your ${userPlan} plan includes ${allowedExecutions} executions per month.`
            );
          }
        }
      );

      // =========================================
      // BUILD GRAPH
      // =========================================

      let graph;
      try {
        graph = buildGraph(allNodes, connections);
      } catch (error) {
        throw new NonRetriableError(
          error instanceof Error ? error.message : "Invalid workflow graph"
        );
      }

      // =========================================
      // RUN A SINGLE NODE
      // =========================================

      const runNode = async (
        node: (typeof allNodes)[number],
        context: WorkflowContext,
        meta: { inputs: { active: number; total: number } }
      ): Promise<WorkflowContext> => {
        const executor = getExecutor(node.type as NodeType);

        const nodeExecutionId = await step.run(
          `node-start-${node.id}`,
          async () => {
            const nodeExecution = await prisma.executionNode.create({
              data: {
                executionId: execution.id,
                nodeId: node.id,
                nodeName: node.name,
                nodeType: node.type,
                status: ExecutionStatus.RUNNING,
                input: toJson(context),
              },
            });

            return nodeExecution.id;
          }
        );

        let output: WorkflowContext;

        try {
          output = await executor({
            data: node.data as Record<string, unknown>,
            nodeId: node.id,
            credential: node.credentialId,
            userId,
            context,
            step,
            allNodes: allNodes as unknown as NodeWithCredential[],    // Agent uses this to find the OpenAI/Gemini config
            connections: connections as any, // Agent uses this to see what is plugged into its target handles
            inputs: meta.inputs,
          });
        } catch (error) {
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Unknown node error";

          const errorStack =
            error instanceof Error
              ? error.stack
              : undefined;

          console.error(`Node failed: ${node.id}`, error);

          await step.run(`node-failed-${node.id}`, async () => {
            const started = await prisma.executionNode.findUnique({
              where: { id: nodeExecutionId },
              select: { startedAt: true },
            });

            const completedAt = new Date();

            await prisma.executionNode.update({
              where: { id: nodeExecutionId },
              data: {
                status: ExecutionStatus.FAILED,
                error: errorMessage,
                errorStack: errorStack,
                completedAt,
                durationMs: started
                  ? completedAt.getTime() - started.startedAt.getTime()
                  : undefined,
              },
            });

            await prisma.execution.update({
              where: { id: execution.id },
              data: {
                status: ExecutionStatus.FAILED,
                error: errorMessage,
                errorStack: errorStack,
                completedAt,
                durationMs:
                  completedAt.getTime() -
                  new Date(execution.startedAt).getTime(), // Track overall workflow execution time up until this crash
              },
            });
          });

          throw new NonRetriableError(
            `Node ${node.id} failed: ${errorMessage}`
          );
        }

        await step.run(`node-finish-${node.id}`, async () => {
          const started = await prisma.executionNode.findUnique({
            where: { id: nodeExecutionId },
            select: { startedAt: true },
          });

          const completedAt = new Date();

          await prisma.executionNode.update({
            where: { id: nodeExecutionId },
            data: {
              status: ExecutionStatus.SUCCESS,
              output: toJson(output),
              completedAt,
              durationMs: started
                ? completedAt.getTime() - started.startedAt.getTime()
                : undefined,
            },
          });
        });

        return output;
      };

      // =========================================
      // EXECUTE NODES
      // =========================================

      // Only connections that were actually activated are followed, so
      // IF / Switch / Filter decide which branches run.
      const context = await runWorkflowGraph({
        graph,
        trigger: event.data.trigger,
        context:
          event.data.InitialData ||
          event.data.initialData ||
          {},
        runNode,
      });

      // =========================================
      // FINALIZE EXECUTION
      // =========================================

      await step.run(
        "finalize-execution",
        async () => {
          const completedAt = new Date();

          return prisma.execution.update({
            where: {
              id: execution.id,
            },
            data: {
              status: ExecutionStatus.SUCCESS,
              completedAt,
              output: toJson(context),
              durationMs:
                completedAt.getTime() -
                new Date(execution.startedAt).getTime(), // Total successful roundtrip time
            },
          });
        }
      );

      return {
        workflowId,
        executionId:
          execution.id,

        result: context,
      };
    }
  );

// =========================================================================
// 2. BACKGROUND TICKER (HEARTBEAT): Wakes up Serverless containers every min
// =========================================================================
export const workflowCronHeartbeat = inngest.createFunction(
  { id: "workflow-cron-heartbeat" },
  { cron: "* * * * *" }, // Wakes up Vercel precisely every single minute
  async ({ step, event }) => {
    // 1. Fetch workflows containing a schedule trigger node
    const scheduledWorkflows = await step.run("fetch-scheduled-workflows", async () => {
      return prisma.workflow.findMany({
        where: {
          active: true,
          nodes: { some: { type: NodeType.SCHEDULE_TRIGGER } },
        },
        include: {
          nodes: { where: { type: NodeType.SCHEDULE_TRIGGER } },
        },
      });
    });

    if (scheduledWorkflows.length === 0) {
      return { status: "skipped", reason: "No active scheduled nodes found." };
    }

    // 2. FIX A: Lock time to the exact moment the Inngest cron event was fired
    // Look at the type definition from the error: it uses `ts` for the timestamp!
    const now = event.ts ? new Date(event.ts) : new Date();

    // 3. FIX B: Normalize 'now' to the absolute start of the current minute block
    const currentMinute = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      now.getHours(),
      now.getMinutes(),
      0,
      0
    );

    // 4. Evaluate each schedule config against this deterministic minute
    for (const workflow of scheduledWorkflows) {
      const triggerNode = workflow.nodes[0];
      if (!triggerNode) continue;

      const nodeData = (triggerNode.data as Record<string, any>) || {};
      // The schedule dialog saves the expression as `cronExpression`
      const cronExpression = nodeData.cronExpression || nodeData.interval || "*/5 * * * *";

      let isDue = false;
      try {
        // Look 1 second backward from the top of the minute to find the next target execution
        const oneSecondBefore = new Date(currentMinute.getTime() - 1000);
        const interval = CronExpressionParser.parse(cronExpression, { currentDate: oneSecondBefore });
        const nextExecution = interval.next().toDate();

        // Is the very next scheduled execution supposed to happen EXACTLY this minute?
        isDue = nextExecution.getTime() === currentMinute.getTime();
      } catch (err) {
        console.error(`Invalid cron calculation on workflow ${workflow.id}: ${cronExpression}`);
        continue;
      }

      if (isDue) {
        // FIX C: Simplify the step ID. It only needs to be unique within this specific run instance.
        await step.run(`trigger-workflow-${workflow.id}`, async () => {
          // A. Instantiate the execution log entry in the DB
          const newExecution = await prisma.execution.create({
            data: {
              workflowId: workflow.id,
              status: ExecutionStatus.RUNNING,
            },
          });

          // B. Fire the formal engine event to run the compiled graph asynchronously
          await inngest.send({
            name: "workflows/execute.workflow",
            data: {
              workflowId: workflow.id,
              executionId: newExecution.id,
              trigger: NodeType.SCHEDULE_TRIGGER,
              InitialData: {
                metadata: {
                  triggeredBy: "schedule_heartbeat",
                  timestamp: currentMinute.toISOString(),
                  interval: cronExpression,
                },
              },
            },
          });
        });
      }
    }
  }
);
