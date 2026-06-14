import { inngest } from "@/inngest/client";
import { codeNodeExecutor } from "../../features/executions/components/code/executor";

export const testCodeNodeWorkflow = inngest.createFunction(
  { id: "test-code-node" },
  { event: "test/code-execution" },
  async ({ event, step, publish }) => {
    const { code, variableName, executionId, nodeId, initialContext, userId } = event.data;

    const updatedContext = await codeNodeExecutor({
      userId: userId || "manual-test-user",
      data: {
        code: code || "const greeting = 'Hello Canvas!'; return { msg: greeting };",
        variableName: variableName || "jsResult",
      },
      context: {
        executionId: executionId || "manual-test-id",
        ...(initialContext || {}),
      },
      publish, // Move publish here (at the top level of the parameter object)
      step,
      nodeId: nodeId || "manual-test-node",
    });

    return {
      message: "Test workflow executed successfully",
      resultingContext: updatedContext,
    };
  }
);