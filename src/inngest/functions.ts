import { switchChannel } from './channels/switch';
import { calculatorChannel } from './channels/calculator';
import { geminiChannel } from "./channels/gemini";
import { inngest } from "./client";
import { NonRetriableError } from "inngest";
import { CronExpressionParser } from "cron-parser";
import { buildGraph, getActiveOutputs, runWorkflowGraph } from "./engine";
import {
  ALL_OUTPUTS,
  runNodeForItems,
  type NodeRunResult,
  type StreamItem,
} from "./items";
import {
  ExecutionStatus,
  NodeType,
  Prisma,
} from "@prisma/client";

import { getExecutor } from "@/features/executions/lib/executor-registry";
import { TRIGGER_SOURCES } from "@/config/trigger-sources";
import { startWorkflowExecution } from "./utils";
import { ensureExpressionEngine } from "@/features/executions/lib/expressions";
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

import { PLAN_LIMITS, getRequiredPlanForNode } from "@/config/plans";

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
import { createRunRedactor } from "@/lib/execution-redaction";
import { redactString } from "@/lib/redaction";

const toJson = (value: unknown) => value as Prisma.InputJsonValue;

// Per-node error handling, saved in the node's data by the canvas toolbar
type NodeErrorSettings = {
  onError?: "stop" | "continue";
  retryOnFail?: boolean;
  maxTries?: number;
  waitBetweenTries?: number;
};

const RETRY_DEFAULT_TRIES = 3;
const RETRY_MAX_TRIES = 5;
const RETRY_DEFAULT_WAIT_MS = 1000;
const RETRY_MAX_WAIT_MS = 5000;

// Nodes whose whole purpose is to fail the run
const ALWAYS_STOP_TYPES = new Set<string>([NodeType.STOP_AND_ERROR]);

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
              error: redactString(
                event.data.error?.message ?? "Unknown workflow error"
              ),
              errorStack: event.data.error?.stack
                ? redactString(event.data.error.stack)
                : undefined,
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

      // Runs started with step.invoke (Execute Workflow) may have no event id
      if (!workflowId || !executionId) {
        throw new NonRetriableError(
          "Workflow ID or execution ID is missing"
        );
      }

      // {{ $json... }} expressions are evaluated synchronously while nodes
      // render their fields, so the sandbox has to be loaded first
      await ensureExpressionEngine();

      // Everything that touches the database runs inside a step. Inngest
      // re-runs this function body after every step, so writes made outside
      // of one would be repeated on each replay.

      // =========================================
      // FIND EXECUTION
      // =========================================

      const execution = await step.run("init-execution", async () => {
        const found = await prisma.execution.findUnique({
          where: { id: executionId },
          include: { workflow: { select: { saveExecutionData: true } } },
        });

        if (!found || found.workflowId !== workflowId) {
          throw new NonRetriableError(
            `Execution ${executionId} not found for workflow ${workflowId}`
          );
        }

        // The trigger and its data are kept so the run can be retried,
        // unless the workflow is set to "Don't save node input/output"
        await prisma.execution.update({
          where: { id: found.id },
          data: {
            ...(inngestEventId ? { inngestEventId } : {}),
            trigger: event.data.trigger ?? null,
            ...(found.workflow.saveExecutionData
              ? {
                  inputData: toJson(
                    event.data.InitialData || event.data.initialData || {}
                  ),
                }
              : {}),
          },
        });

        return {
          id: found.id,
          startedAt: found.startedAt.toISOString(),
        };
      });

      // =========================================
      // PREPARE WORKFLOW
      // =========================================

      const {
        allNodes,
        connections,
        userId,
        userPlan,
        trialEndsAt,
        workflowName,
        saveExecutionData,
        credentialValues,
      } = await step.run(
        "prepare-workflow",
        async () => {
          const workflow = await prisma.workflow.findUniqueOrThrow({
            where: {
              id: workflowId,
            },
            include: {
              // Nodes only: each executor loads its own credential, by id
              // and owner, when it runs
              nodes: true,
              connections: true,
              user: {
                select: {
                  plan: true, // Dynamically fetch user's subscription tier
                  trialEndsAt: true,
                  // Still encrypted. Used to keep their values out of what
                  // is stored about the run.
                  credentials: { select: { value: true } },
                },
              },
            },
          });

          return {
            saveExecutionData: workflow.saveExecutionData,
            credentialValues: workflow.user.credentials.map(
              (credential) => credential.value
            ),
            allNodes: workflow.nodes,
            connections: workflow.connections, // We need this to trace cables!
            userId: workflow.userId,
            workflowName: workflow.name,
            userPlan: workflow.user.plan,
            trialEndsAt: workflow.user.trialEndsAt,
          };
        }
      );

      // What is stored about the run goes through this first. The run
      // itself always works with the real data. Runs that started before
      // this existed have neither value in their saved step result.
      const redactor = createRunRedactor(credentialValues ?? []);
      const saveNodeData = saveExecutionData !== false;

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
        meta: {
          inputs: { active: number; total: number };
          items: StreamItem[] | null;
        }
      ): Promise<NodeRunResult> => {
        // Paid-plan nodes stop the run with a message the user can act on
        const requiredPlan = getRequiredPlanForNode(
          node.type,
          userPlan,
          trialEndsAt
        );

        if (requiredPlan) {
          throw new NonRetriableError(
            `The ${node.type} node requires the ${requiredPlan} plan. Upgrade your plan or remove the node.`
          );
        }

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
                ...(saveNodeData
                  ? { input: toJson(redactor.data(context)) }
                  : {}),
              },
            });

            return nodeExecution.id;
          }
        );

        const settings: NodeErrorSettings = ALWAYS_STOP_TYPES.has(node.type)
          ? {}
          : ((node.data ?? {}) as NodeErrorSettings);

        // Like n8n's "Retry On Fail": the first try plus the retries
        const maxTries = settings.retryOnFail
          ? Math.min(
              Math.max(Number(settings.maxTries) || RETRY_DEFAULT_TRIES, 2),
              RETRY_MAX_TRIES
            )
          : 1;

        const waitBetweenTries = Math.min(
          Math.max(
            Number(settings.waitBetweenTries ?? RETRY_DEFAULT_WAIT_MS) || 0,
            0
          ),
          RETRY_MAX_WAIT_MS
        );

        let output: NodeRunResult | undefined;
        let failure: unknown;

        for (let attempt = 1; attempt <= maxTries; attempt++) {
          try {
            // Runs the executor once, or once per item when a list node
            // upstream sent items here
            output = await runNodeForItems({
              node,
              context,
              items: meta.items,
              getActiveOutputs,
              execute: (runContext, runItems) =>
                executor({
                  data: node.data as Record<string, unknown>,
                  nodeId: node.id,
                  credential: node.credentialId,
                  userId,
                  context: runContext,
                  step,
                  allNodes: allNodes as unknown as NodeWithCredential[],    // Agent uses this to find the OpenAI/Gemini config
                  connections: connections as any, // Agent uses this to see what is plugged into its target handles
                  inputs: meta.inputs,
                  items: runItems,
                  executionId: execution.id,
                  workflowId,
                  callDepth: Number(event.data.callDepth) || 0,
                }),
            });
            failure = undefined;
            break;
          } catch (error) {
            failure = error;

            if (attempt < maxTries && waitBetweenTries > 0) {
              await step.sleep(
                `node-retry-wait-${node.id}-${attempt}`,
                waitBetweenTries
              );
            }
          }
        }

        if (failure !== undefined || !output) {
          const error = failure;
          const errorMessage =
            error instanceof Error
              ? error.message
              : "Unknown node error";

          const errorStack =
            error instanceof Error
              ? error.stack
              : undefined;

          // What is stored, logged and sent on: an API's error text can
          // repeat the key or header it was given
          const savedErrorMessage = redactor.text(errorMessage);
          const savedErrorStack = redactor.text(errorStack);

          console.error(`Node failed: ${node.id}`, savedErrorStack ?? savedErrorMessage);

          // "On Error: Continue": the node is marked as failed, the run goes
          // on and later nodes can read {{error.message}}
          if (settings.onError === "continue") {
            await step.run(`node-continued-${node.id}`, async () => {
              const started = await prisma.executionNode.findUnique({
                where: { id: nodeExecutionId },
                select: { startedAt: true },
              });

              const completedAt = new Date();

              await prisma.executionNode.update({
                where: { id: nodeExecutionId },
                data: {
                  status: ExecutionStatus.FAILED,
                  error: savedErrorMessage,
                  errorStack: savedErrorStack,
                  completedAt,
                  durationMs: started
                    ? completedAt.getTime() - started.startedAt.getTime()
                    : undefined,
                },
              });
            });

            return {
              context: {
                ...context,
                error: {
                  message: errorMessage,
                  nodeId: node.id,
                  nodeType: node.type,
                },
              },
              // The items go on to the next node as they arrived
              outputItems: meta.items ? { [ALL_OUTPUTS]: meta.items } : null,
            };
          }

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
                error: savedErrorMessage,
                errorStack: savedErrorStack,
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
                error: savedErrorMessage,
                errorStack: savedErrorStack,
                completedAt,
                durationMs:
                  completedAt.getTime() -
                  new Date(execution.startedAt).getTime(), // Track overall workflow execution time up until this crash
              },
            });
          });

          // Error Trigger: a failure starts the workflows that listen for
          // it. A failing error workflow does not trigger another one.
          if (event.data.trigger !== NodeType.ERROR_TRIGGER) {
            await step.run(`error-trigger-${node.id}`, async () => {
              const listeners = await prisma.node.findMany({
                where: {
                  type: NodeType.ERROR_TRIGGER,
                  workflow: { userId },
                },
                select: { workflowId: true, data: true },
              });

              // By default an Error Trigger catches failures of its own
              // workflow; with scope "all" it catches every workflow's
              const targets = new Set(
                listeners
                  .filter(
                    (listener) =>
                      listener.workflowId === workflowId ||
                      (listener.data as { scope?: string } | null)?.scope ===
                        "all"
                  )
                  .map((listener) => listener.workflowId)
              );

              for (const targetWorkflowId of targets) {
                await startWorkflowExecution({
                  workflowId: targetWorkflowId,
                  trigger: NodeType.ERROR_TRIGGER,
                  initialData: {
                    execution: {
                      id: execution.id,
                      error: { message: savedErrorMessage, stack: savedErrorStack },
                      lastNodeExecuted: node.type,
                      lastNodeId: node.id,
                    },
                    workflow: { id: workflowId, name: workflowName },
                  },
                });
              }
            });
          }

          throw new NonRetriableError(
            `Node ${node.id} failed: ${savedErrorMessage}`
          );
        }

        const finalOutput = output;

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
              ...(saveNodeData
                ? { output: toJson(redactor.data(finalOutput.context)) }
                : {}),
              completedAt,
              durationMs: started
                ? completedAt.getTime() - started.startedAt.getTime()
                : undefined,
            },
          });
        });

        return finalOutput;
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
              ...(saveNodeData
                ? { output: toJson(redactor.result(context)) }
                : {}),
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
          user: { select: { plan: true, trialEndsAt: true } },
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

      // Do not start runs that would only fail the plan check
      if (
        getRequiredPlanForNode(
          NodeType.SCHEDULE_TRIGGER,
          workflow.user.plan,
          workflow.user.trialEndsAt
        )
      ) {
        continue;
      }

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
              triggerSource: TRIGGER_SOURCES.SCHEDULE,
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
