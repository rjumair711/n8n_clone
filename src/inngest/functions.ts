import { geminiChannel } from './channels/gemini';
import { inngest } from "./client";
import { NonRetriableError } from "inngest";
import { topologicalSort } from "./utils";
import { ExecutionStatus, NodeType } from "@prisma/client";
import { getExecutor } from "@/features/executions/lib/executor-registry";
import { httpRequestChannel } from "./channels/http-request";
import { manualTriggerChannel } from "./channels/manual-trigger";
import { googleFormTriggerChannel } from "./channels/google-form-trigger";
import { stripeTriggerChannel } from "./channels/stripe-trigger";
import { openaiChannel } from './channels/openai';
import { anthropicChannel } from './channels/anthropic';
import { discordChannel } from './channels/discord';
import { slackChannel } from './channels/slack';
import prisma from '@/lib/db';
import { PLAN_LIMITS } from '@/config/plans';
import { webhookChannel } from './channels/webhookResponse';
import { filterChannel } from './channels/filter';
import { delayChannel } from './channels/delay';
import { emailChannel } from './channels/email';
import { googleSheetsChannel } from './channels/googleSheet';

export const executeWorkflow = inngest.createFunction(
  {
    id: "execute-workflow",
    retries: process.env.NODE_ENV === "production" ? 3 : 0,
    onFailure: async ({ event, step }) => {
      return prisma.execution.update({
        where: { inngestEventId: event.data.event.id },
        data: {
          status: ExecutionStatus.FAILED,
          error: event.data.error.message,
          errorStack: event.data.error.stack
        }
      })
    }
  },
  {
    event: "workflows/execute.workflow",
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
      googleSheetsChannel()
    ],
  },
  async ({ event, step, publish }) => {

    const inngestEventId = event.id;
    const workflowId = event.data.workflowId;

    if (!inngestEventId || !workflowId) {
      throw new NonRetriableError("Workflow ID is missing")
    }

    // Step 1: Create an execution entry in the database
    await step.run("create-execution", async () => {
      return prisma.execution.create({
        data: {
          workflowId,
          inngestEventId
        }
      })
    })

    // Step 2: Prepare the workflow nodes by sorting them
    const sortedNodes = await step.run("prepare-workflow", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        include: {
          nodes: {
            include: { credential: true } // Fetch credentials HERE once
          },
          connections: true
        },
      });

      return topologicalSort(workflow.nodes, workflow.connections);
    });

    const userId = await step.run("find-user-id", async () => {
      const workflow = await prisma.workflow.findUniqueOrThrow({
        where: { id: workflowId },
        select: {
          userId: true,
        },
      });

      return workflow.userId
    })

    // Step 3: Check the user's monthly execution limit
    await step.run("check-monthly-execution-limit", async () => {
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

      if (executionsThisMonth >= PLAN_LIMITS.PRO.monthlyExecutions) {
        throw new NonRetriableError(
          `Monthly execution limit reached. Your Pro plan includes ${PLAN_LIMITS.PRO.monthlyExecutions} executions per month.`
        );
      }
    });

    // Step 4: Initialize the context with initial data from the trigger 
    let context = event.data.InitialData || {}

    // Step 5: Execute each node
    for (const node of sortedNodes) {
      const executor = getExecutor(node.type as NodeType);

      // Log the node about to execute
      console.log(`Executing node: ${node.id} - Type: ${node.type}`);

      // Execute the node and get the updated context
      try {
        context = await executor({
          data: node.data as Record<string, unknown>,
          nodeId: node.id,
          credential: node.credentialId,
          userId,
          context,
          step,
          publish,
        });

        // Log the result of each node execution
        console.log(`Node executed: ${node.id} - Result:`, context);

      } catch (error: unknown) {
        // Check if error is an instance of the built-in Error object
        if (error instanceof Error) {
          console.error(`Error executing node: ${node.id} - Error:`, error);
          throw new NonRetriableError(`Node ${node.id} failed: ${error.message}`);
        } else {
          // Handle the case where the error is not an instance of Error (e.g., a string or other object)
          console.error(`Error executing node: ${node.id} - Unknown error:`, error);
          throw new NonRetriableError(`Node ${node.id} failed with an unknown error`);
        }
      }

      // Check if the node is a Filter node and if filterPassed is false, then stop execution
      if (node.type === NodeType.FILTER && context.filterPassed === false) {
        console.log(`Filter failed at node ${node.id}, skipping next nodes.`);
        break;  // Stop execution if the filter is not passed
      }
    }

    // Step 6: Finalize the execution and update the status
    await step.run("update-execution", async () => {
      return prisma.execution.update({
        where: { inngestEventId, workflowId },
        data: {
          status: ExecutionStatus.SUCCESS,
          completedAt: new Date(),
          output: context,
        }
      })
    })

    return {
      workflowId,
      result: context
    }
  }
);