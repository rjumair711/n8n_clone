import { codeChannel } from "@/inngest/channels/code";
import { NodeExecutor } from "../../types";
import { NonRetriableError } from "inngest";
import vm from "vm";

type CodeNodeExecutionData = {
  code?: string;
  variableName?: string;
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
  const formattedScriptCode = `(async () => { ${data.code} })()`;
  const runtimeLogs: string[] = [];

  const result = await step.run("execute-sandbox-script", async () => {
    try {
      const sandbox = {
        context: executionContextSnapshot,
        console: {
          log: (...args: any[]) => {
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(" ");
            runtimeLogs.push(`[LOG] ${message}`);
            
            if (publish) {
              publish(
                codeChannel().log({
                  executionId,
                  nodeId,
                  type: "LOG",
                  message,
                  timestamp: new Date().toISOString(),
                })
              ).catch(() => {});
            }
          },
          error: (...args: any[]) => {
            const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(" ");
            runtimeLogs.push(`[ERROR] ${message}`);
            
            if (publish) {
              publish(
                codeChannel().log({
                  executionId,
                  nodeId,
                  type: "ERROR",
                  message,
                  timestamp: new Date().toISOString(),
                })
              ).catch(() => {});
            }
          },
        }
      };

      vm.createContext(sandbox);
      const script = new vm.Script(formattedScriptCode, { filename: "sandbox-workflow-user-code.js" });

      const executionPromise = script.runInContext(sandbox, {
        timeout: 4000, 
        breakOnSigint: true
      });

      const timeoutFallback = new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Script execution timed out (4000ms limit exceeded)")), 4000)
      );

      const outputData = await Promise.race([executionPromise, timeoutFallback]);

      let finalizedOutput = outputData;
      if (outputData === undefined || outputData === null) {
        finalizedOutput = { status: "success", info: "Script processed successfully" };
      } else if (typeof outputData !== "object" || Array.isArray(outputData)) {
        finalizedOutput = { result: outputData };
      }

      return {
        success: true as const,
        data: finalizedOutput,
        logs: runtimeLogs,
      };
    } catch (error: any) {
      return {
        success: false as const,
        error: error.message,
        logs: runtimeLogs,
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