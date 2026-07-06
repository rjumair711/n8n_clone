import { calculatorChannel } from './channels/calculator';
import { geminiChannel } from "./channels/gemini";
import { inngest } from "./client";
import { NonRetriableError } from "inngest";
import { CronExpressionParser } from "cron-parser";
import { topologicalSort } from "./utils";
import {
  ExecutionStatus,
  NodeType,
} from "@prisma/client";

import { getExecutor } from "@/features/executions/lib/executor-registry";

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
          // Fetch execution to calculate duration if available
          const exec = await prisma.execution.findUnique({
            where: { inngestEventId: event.data.event.id },
            select: { startedAt: true }
          });

          const durationMs = exec
            ? Date.now() - new Date(exec.startedAt).getTime()
            : undefined;

          await prisma.execution.update(
            {
              where: {
                inngestEventId:
                  event.data.event.id,
              },

              data: {
                status:
                  ExecutionStatus.FAILED,

                error:
                  event.data.error
                    ?.message ??
                  "Unknown workflow error",

                errorStack:
                  event.data.error
                    ?.stack,

                completedAt:
                  new Date(),

                durationMs: durationMs, // Capture total duration on global failure
              },
            }
          );
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
        calculatorChannel()
      ],
    },

    async ({ event, step }) => {
      const inngestEventId =
        event.id;

      const workflowId =
        event.data.workflowId;

      if (
        !inngestEventId ||
        !workflowId
      ) {
        throw new NonRetriableError(
          "Workflow ID is missing"
        );
      }

      // =========================================
      // FIND EXECUTION
      // =========================================

      const execution =
        await prisma.execution.findUniqueOrThrow(
          {
            where: {
              id:
                event.data.executionId,
            },
          }
        );

      await prisma.execution.update({
        where: {
          id: execution.id,
        },

        data: {
          inngestEventId:
            inngestEventId,
        },
      });

      // =========================================
      // PREPARE WORKFLOW
      // =========================================

      const { sortedNodes, allNodes, connections } = await step.run(
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
            },
          });

          return {
            sortedNodes: topologicalSort(workflow.nodes, workflow.connections),
            allNodes: workflow.nodes,
            connections: workflow.connections, // We need this to trace cables!
          };
        }
      );

      // =========================================
      // FIND USER & PLAN TIER
      // =========================================

      const { userId, userPlan } =
        await step.run(
          "find-user-and-plan",
          async () => {
            const workflow =
              await prisma.workflow.findUniqueOrThrow(
                {
                  where: {
                    id: workflowId,
                  },

                  select: {
                    userId: true,
                    user: {
                      select: {
                        plan: true, // Dynamically fetch user's subscription tier
                      }
                    }
                  },
                }
              );

            return {
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
          const startOfMonth =
            new Date();

          startOfMonth.setDate(1);

          startOfMonth.setHours(
            0,
            0,
            0,
            0
          );

          const executionsThisMonth =
            await prisma.execution.count(
              {
                where: {
                  workflow: {
                    userId,
                  },

                  startedAt: {
                    gte:
                      startOfMonth,
                  },
                },
              }
            );

          // Get exact limit for this user's current tier
          const allowedExecutions =
            PLAN_LIMITS[userPlan]?.monthlyExecutions ??
            PLAN_LIMITS.FREE.monthlyExecutions;

          if (executionsThisMonth >= allowedExecutions) {
            throw new NonRetriableError(
              `Monthly execution limit reached. Your ${userPlan} plan includes ${allowedExecutions} executions per month.`
            );
          }
        }
      );

      // =========================================
      // INITIAL CONTEXT
      // =========================================

      let context =
        event.data.InitialData ||
        {};

      // =========================================================================
      // N8N FIX: FILTER OUT STRUCTURAL SUPPLY NODES FROM THE MAIN SEQUENTIAL LOOP
      // =========================================================================
      const executableNodes = sortedNodes.filter((node) => {
        // 1. Filter out AI Models and Memories (They are lazily loaded by AI_AGENT, not standalone execution steps)
        const isAIParameterSupplyNode = [
          "GEMINI",
          "OPENAI",
          "ANTHROPIC",
          "BUFFER_MEMORY",
        ].includes(node.type);

        if (isAIParameterSupplyNode) return false;

        // 2. Filter out nodes used exclusively as an Agent tool parameter (e.g. connected to toInput: "tools")
        const isUsedAsToolOnly = connections.some(
          (conn) => conn.fromNodeId === node.id && conn.toInput === "tools"
        );

        const hasMainTimelineOutput = connections.some(
          (conn) => conn.fromNodeId === node.id &&
            conn.toInput !== "tools" &&
            !conn.toInput?.includes("Model") &&
            conn.toInput !== "memory"
        );

        if (isUsedAsToolOnly && !hasMainTimelineOutput) {
          return false;
        }

        return true;
      });

      // =========================================
      // EXECUTE NODES
      // =========================================

      for (const node of executableNodes) {
        const executor =
          getExecutor(
            node.type as NodeType
          );

        console.log(
          `Executing node: ${node.id}`
        );

        // =====================================
        // CREATE NODE EXECUTION
        // =====================================

        const nodeExecution =
          await prisma.executionNode.create(
            {
              data: {
                executionId:
                  execution.id,

                nodeId: node.id,

                nodeName:
                  node.name,

                nodeType:
                  node.type,

                status:
                  ExecutionStatus.RUNNING,

                input: context,
              },
            }
          );

        // =====================================
        // PUBLISH RUNNING EVENT
        // =====================================

        await step.sendEvent(
          "node-running-event",
          {
            name: "workflow/node.running",
            data: {
              workflowId,
              executionId: execution.id,
              nodeExecutionId: nodeExecution.id,
              nodeId: node.id,
              nodeType: node.type,
              status: "loading",
            },
          }
        );

        // Start performance tracking block for this individual node
        const nodeStartTime = Date.now();

        try {
          // ===================================
          // EXECUTE NODE
          // ===================================

          context = await executor({
            data: node.data as Record<string, unknown>,
            nodeId: node.id,
            credential: node.credentialId,
            userId,
            context,
            step,
            allNodes: allNodes as any,    // Agent uses this to find the OpenAI/Gemini config
            connections: connections as any, // Agent uses this to see what is plugged into its target handles
          });

          const nodeDurationMs = Date.now() - nodeStartTime; // Calculate delta

          // ===================================
          // UPDATE NODE SUCCESS
          // ===================================

          await prisma.executionNode.update(
            {
              where: {
                id:
                  nodeExecution.id,
              },

              data: {
                status:
                  ExecutionStatus.SUCCESS,

                output:
                  context,

                completedAt:
                  new Date(),

                durationMs: nodeDurationMs, // Save metrics to DB
              },
            }
          );

          // ===================================
          // PUBLISH SUCCESS EVENT
          // ===================================

          await step.sendEvent(
            "node-success-event",
            {
              name: "workflow/node.success",
              data: {
                workflowId,
                executionId: execution.id,
                nodeExecutionId: nodeExecution.id,
                nodeId: node.id,
                nodeType: node.type,
                status: "SUCCESS",
                output: context,
              },
            }
          );

          console.log(
            `Node success: ${node.id}`
          );
        } catch (error) {
          const nodeDurationMs = Date.now() - nodeStartTime; // Calculate delta even on failures

          const errorMessage =
            error instanceof Error
              ? error.message
              : "Unknown node error";

          const errorStack =
            error instanceof Error
              ? error.stack
              : undefined;

          console.error(
            `Node failed: ${node.id}`,
            error
          );

          // ===================================
          // UPDATE NODE FAILURE
          // ===================================

          await prisma.executionNode.update(
            {
              where: {
                id:
                  nodeExecution.id,
              },

              data: {
                status:
                  ExecutionStatus.FAILED,

                error:
                  errorMessage,

                errorStack:
                  errorStack,

                completedAt:
                  new Date(),

                durationMs: nodeDurationMs, // Save metrics to DB
              },
            }
          );

          // ===================================
          // UPDATE WORKFLOW FAILURE
          // ===================================

          await prisma.execution.update(
            {
              where: {
                id:
                  execution.id,
              },

              data: {
                status:
                  ExecutionStatus.FAILED,

                error:
                  errorMessage,

                errorStack:
                  errorStack,

                completedAt:
                  new Date(),

                durationMs: Date.now() - new Date(execution.startedAt).getTime(), // Track overall workflow execution time up until this crash
              },
            }
          );

          // ===================================
          // PUBLISH FAILURE EVENT
          // ===================================

          await step.sendEvent(
            "node-error-event",
            {
              name: "workflow/node.error",
              data: {
                workflowId,
                executionId: execution.id,
                nodeExecutionId: nodeExecution.id,
                nodeId: node.id,
                nodeType: node.type,
                status: "error",
                error: errorMessage,
              },
            }
          );

          throw new NonRetriableError(
            `Node ${node.id} failed: ${errorMessage}`
          );
        }

        // =====================================
        // FILTER SHORT CIRCUIT
        // =====================================

        if (
          node.type ===
          NodeType.FILTER &&
          context.filterPassed ===
          false
        ) {
          console.log(
            `Filter stopped workflow at node ${node.id}`
          );

          break;
        }
      }

      // =========================================
      // FINALIZE EXECUTION
      // =========================================

      await step.run(
        "finalize-execution",
        async () => {
          const totalDurationMs = Date.now() - new Date(execution.startedAt).getTime(); // Total successful roundtrip time

          return prisma.execution.update(
            {
              where: {
                id: execution.id,
              },

              data: {
                status:
                  ExecutionStatus.SUCCESS,

                completedAt:
                  new Date(),

                output: context,

                durationMs: totalDurationMs, // Save metrics to DB
              },
            }
          );
        }
      );

      // =========================================
      // WORKFLOW SUCCESS EVENT
      // =========================================

      await step.sendEvent(
        "workflow-success-event",
        {
          name: "workflow/success",
          data: {
            workflowId,
            executionId: execution.id,
            status: "success",
            output: context,
          },
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
      const cronExpression = nodeData.interval || "*/5 * * * *";

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