import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { createOpenAI } from "@ai-sdk/openai";
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

type OpenAIData = {
  variableName?: string;
  credentialId?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
};

export const OpenAIExecutor: NodeExecutor<
  OpenAIData
> = async ({
  data,
  userId,
  context,
  step,
}) => {

  // Validation
  if (!data.variableName) {
    throw new NonRetriableError(
      "OpenAI node: Variable name is missing"
    );
  }

  if (!data.credentialId) {
    throw new NonRetriableError(
      "OpenAI node: Credential ID is required"
    );
  }

  if (!data.userPrompt) {
    throw new NonRetriableError(
      "OpenAI node: User prompt is required"
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
      "OpenAI node: Credential not found"
    );
  }

  // Create OpenAI client
  const openai = createOpenAI({
    apiKey: decrypt(credential.value),
  });

  try {

    const { steps } = await step.ai.wrap(
      "openai-generate-text",
      generateText,
      {
        model: openai(
          data.model || "gpt-4o-mini"
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
      `OpenAI node failed: ${error.message}`
    );
  }
};