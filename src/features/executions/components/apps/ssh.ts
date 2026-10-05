import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import {
  SSH_DEFAULT_TIMEOUT_SECONDS,
  SSH_MAX_TIMEOUT_SECONDS,
  runSshCommand,
  shellQuote,
  type SshConnection,
} from "@/lib/ssh";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";

type SshData = {
  variableName?: string;
  credentialId?: string;
  command?: string;
  workingDirectory?: string;
  timeout?: string;
  // "no" (default, like n8n): a failing command is reported in `code`.
  // "yes": a non-zero exit code fails the node.
  failOnError?: string;
};

/**
 * Runs one command on the server saved in the credential, like n8n's SSH
 * node: the result has `code`, `stdout` and `stderr`.
 */
export const sshExecutor: NodeExecutor<SshData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  if (!data.variableName) {
    throw new NonRetriableError("SSH node: Variable name is missing");
  }

  const variableName = data.variableName;
  const command = renderTemplate(data.command, context).trim();

  if (!command) {
    throw new NonRetriableError("SSH node: Command is required");
  }

  const workingDirectory = renderTemplate(data.workingDirectory, context).trim();

  // The directory is quoted, so a name with spaces or symbols stays a name
  const fullCommand = workingDirectory
    ? `cd -- ${shellQuote(workingDirectory)} && ${command}`
    : command;

  const timeoutSeconds = Math.min(
    Math.max(Number(renderTemplate(data.timeout, context)) || SSH_DEFAULT_TIMEOUT_SECONDS, 1),
    SSH_MAX_TIMEOUT_SECONDS
  );

  const secret = await loadCredentialSecret({
    step,
    stepId: `ssh-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: "SSH",
  });

  let connection: SshConnection;
  try {
    connection = JSON.parse(secret);
  } catch {
    throw new NonRetriableError("SSH node: Invalid credential format");
  }

  if (!connection?.host?.trim()) {
    throw new NonRetriableError("SSH node: the credential has no host");
  }

  try {
    const result = await step.run(`ssh-${nodeId}-run`, async () => {
      const output = await runSshCommand(connection, fullCommand, {
        timeoutSeconds,
      });

      if (data.failOnError === "yes" && output.code !== 0) {
        throw new NonRetriableError(
          `SSH node: the command exited with code ${output.code ?? `signal ${output.signal}`}${output.stderr.trim() ? `: ${output.stderr.trim().slice(0, 500)}` : ""}`
        );
      }

      return output;
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;

    throw new NonRetriableError(`SSH node failed: ${error?.message}`);
  }
};
