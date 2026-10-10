import { codeChannel } from "@/inngest/channels/code";
import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import { runInSandbox } from "../../lib/code-sandbox";
import { resolveCodeTimeoutSeconds } from "../../lib/sandbox-limits";

type CodeNodeExecutionData = {
  code?: string;
  variableName?: string;
  // "Timeout (seconds)": 10 when not set, 60 at most
  timeoutSeconds?: number | string;
};

export const codeNodeExecutor: NodeExecutor<CodeNodeExecutionData> = async ({
  userId,
  data,
  context,
  step,
  nodeId,
}) => {
  if (!data.code || data.code.trim() === "") {
    throw new NonRetriableError("Code Execution Node: Executable script block string is required");
  }

  if (!data.variableName) {
    throw new NonRetriableError("Code Execution Node: Target return mapping storage key is required");
  }

  const executionId = (context as any).executionId || "global";
  const publish = (context as any).publish; // Safely pull from passed context parameters

  // Initial loading broadcast
  if (publish) {
    await publish(
      codeChannel().status({
        executionId,
        nodeId,
        status: "loading",
        message: "Spawning execution sandbox...",
      })
    ).catch(() => {});
  }

  const executionContextSnapshot = JSON.parse(JSON.stringify(context));
  // The publish function cannot cross into the sandbox
  delete executionContextSnapshot.publish;

  const result = await step.run("execute-sandbox-script", async () => {
    try {
      const outcome = await runInSandbox(
        data.code!,
        executionContextSnapshot,
        (type, message) => {
          if (publish) {
            publish(
              codeChannel().log({
                executionId,
                nodeId,
                type,
                message,
                timestamp: new Date().toISOString(),
              })
            ).catch(() => {});
          }
        },
        { timeoutMs: resolveCodeTimeoutSeconds(data.timeoutSeconds) * 1000 }
      );

      if (!outcome.success) {
        return outcome;
      }

      const outputData = outcome.data;

      let finalizedOutput = outputData;
      if (outputData === undefined || outputData === null) {
        finalizedOutput = { status: "success", info: "Script processed successfully" };
      } else if (typeof outputData !== "object" || Array.isArray(outputData)) {
        finalizedOutput = { result: outputData };
      }

      return {
        success: true as const,
        data: finalizedOutput,
        logs: outcome.logs,
      };
    } catch (error: any) {
      return {
        success: false as const,
        error: error.message as string,
        logs: [] as string[],
      };
    }
  });

  if (result.success) {
    if (publish) {
      await publish(codeChannel().status({ executionId, nodeId, status: "success", message: "Execution finished" })).catch(() => {});
      await publish(
        codeChannel().response({
          executionId,
          nodeId,
          variableName: data.variableName,
          output: result.data,
          logs: result.logs,
          responseStatus: "success",
        })
      ).catch(() => {});
    }

    return {
      ...context,
      [data.variableName]: result.data,
    };
  } else {
    if (publish) {
      await publish(
        codeChannel().status({
          executionId,
          nodeId,
          status: "error",
          message: result.error,
        })
      ).catch(() => {});

      await publish(
        codeChannel().response({
          executionId,
          nodeId,
          variableName: data.variableName,
          output: null,
          logs: result.logs,
          responseStatus: "error",
        })
      ).catch(() => {});
    }

    throw new Error(`Execution Engine Crash: ${result.error}`);
  }
};