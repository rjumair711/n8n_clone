import { geminiChannel } from "./channels/gemini";
import { inngest } from "./client";
import { NonRetriableError } from "inngest";
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

      const sortedNodes =
        await step.run(
          "prepare-workflow",
          async () => {
            const workflow =
              await prisma.workflow.findUniqueOrThrow(
                {
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
                }
              );

            return topologicalSort(
              workflow.nodes,
              workflow.connections
            );
          }
        );

      // =========================================
      // FIND USER
      // =========================================

      const userId =
        await step.run(
          "find-user-id",
          async () => {
            const workflow =
              await prisma.workflow.findUniqueOrThrow(
                {
                  where: {
                    id: workflowId,
                  },

                  select: {
                    userId: true,
                  },
                }
              );

            return workflow.userId;
          }
        );

      // =========================================
      // PLAN LIMIT CHECK
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

          if (
            executionsThisMonth >=
            PLAN_LIMITS.PRO
              .monthlyExecutions
          ) {
            throw new NonRetriableError(
              `Monthly execution limit reached. Your Pro plan includes ${PLAN_LIMITS.PRO.monthlyExecutions} executions per month.`
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

      // =========================================
      // EXECUTE NODES
      // =========================================

      for (const node of sortedNodes) {
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

        try {
          // ===================================
          // EXECUTE NODE
          // ===================================

          context =
            await executor({
              data:
                node.data as Record<
                  string,
                  unknown
                >,

              nodeId: node.id,

              credential:
                node.credentialId,

              userId,

              context,

              step,
            });

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