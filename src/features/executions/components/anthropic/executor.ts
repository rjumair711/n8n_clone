import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { createAnthropic } from "@ai-sdk/anthropic";
import Handlebars from "handlebars";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

Handlebars.registerHelper("json", (context) => {
  const jsonString = JSON.stringify(
    context,
    null,
    2
  );

  return new Handlebars.SafeString(
    jsonString
  );
});

type AnthropicData = {
  variableName?: string;
  model?: string;
  credentialId?: string;
  systemPrompt?: string;
  userPrompt?: string;
};

export const AnthropicExecutor: NodeExecutor<
  AnthropicData
> = async ({
  data,
  userId,
  context,
  step,
}) => {

  // Validation
  if (!data.variableName) {
    throw new NonRetriableError(
      "Anthropic node: Variable name is missing"
    );
  }

  if (!data.credentialId) {
    throw new NonRetriableError(
      "Anthropic node: Credential ID is required"
    );
  }

  if (!data.userPrompt) {
    throw new NonRetriableError(
      "Anthropic node: User prompt is required"
    );
  }

  // Compile prompts
  const systemPrompt = data.systemPrompt
    ? Handlebars.compile(
        data.systemPrompt
      )(context)
    : "You are a helpful assistant.";

  const userPrompt = Handlebars.compile(
    data.userPrompt
  )(context);

  // Fetch credential
  const credential = await step.run(
    "get-credential",
    async () => {
      return prisma.credential.findUnique({
        where: {
          id: data.credentialId,
          userId,
        },
      });
    }
  );

  if (!credential) {
    throw new NonRetriableError(
      "Anthropic node: Credential not found"
    );
  }

  // Create Anthropic client
  const anthropic = createAnthropic({
    apiKey: decrypt(credential.value),
  });

  try {

    const { steps } = await step.ai.wrap(
      "anthropic-generate-text",
      generateText,
      {
        model: anthropic(
          data.model || "claude-3-5-sonnet"
        ),

        system: systemPrompt,

        prompt: userPrompt,

        experimental_telemetry: {
          isEnabled: true,
          recordInputs: true,
          recordOutputs: true,
        },
      }
    );

    const text =
      steps[0].content[0].type === "text"
        ? steps[0].content[0].text
        : "";

    return {
      ...context,

      [data.variableName]: {
        text,
      },
    };

  } catch (error: any) {

    throw new NonRetriableError(
      `Anthropic node failed: ${error.message}`
    );
  }
};