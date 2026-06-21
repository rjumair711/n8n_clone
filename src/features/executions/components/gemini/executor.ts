import type { NodeExecutor } from "@/features/executions/types";
import { NonRetriableError } from "inngest";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import Handlebars from "handlebars";
import { generateText } from "ai";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";

// Guard helper registration against potential hot-reload double registration crashes
try {
  Handlebars.registerHelper("json", (context) => {
    return new Handlebars.SafeString(JSON.stringify(context, null, 2));
  });
} catch {
  // Gracefully skip if already registered
}

type GeminiData = {
  variableName?: string;
  credentialId?: string;
  model?: string;
  systemPrompt?: string;
  userPrompt?: string;
};

export const geminiExecutor: NodeExecutor<GeminiData> = async ({
  data,
  userId,
  context,
  step,
}) => {
  // ==========================================
  // 1. VALIDATION
  // ==========================================
  if (!data.variableName) throw new NonRetriableError("Gemini node: Variable name is missing");
  if (!data.credentialId) throw new NonRetriableError("Gemini node: Credential ID is required");
  if (!data.userPrompt) throw new NonRetriableError("Gemini node: User prompt is required");

  // ==========================================
  // 2. TEMPLATE COMPILATION
  // ==========================================
  const systemPrompt = data.systemPrompt
    ? Handlebars.compile(data.systemPrompt)(context)
    : "You are a helpful assistant.";

  const userPrompt = Handlebars.compile(data.userPrompt)(context);

  // ==========================================
  // 3. CREDENTIAL RETRIEVAL
  // ==========================================
  const credential = await step.run("get-credential", async () => {
    return prisma.credential.findUnique({
      where: {
        id: data.credentialId,
        userId,
      },
    });
  });

  if (!credential) {
    throw new NonRetriableError("Gemini node: Credential not found");
  }

  // ==========================================
  // 4. INFERENCE EXECUTION LAYER
  // ==========================================
  try {
    const apiKey = decrypt(credential.value);
    const targetModel = data.model || "gemini-2.5-flash";

    // Run execution inside a safe functional step block
    const executionResult = await step.run("gemini-generate-text", async () => {
      const google = createGoogleGenerativeAI({ apiKey });
      const modelInstance = google(targetModel);

      const response = await generateText({
        model: modelInstance,
        system: systemPrompt,
        prompt: userPrompt,
        experimental_telemetry: {
          isEnabled: true,
          recordInputs: true,
          recordOutputs: true,
        },
      });

      // Safely serialize execution telemetry markers for Inngest state checkpoints
      return {
        text: response.text,
        usage: response.usage,
      };
    });

    // ==========================================
    // 5. IMMUTABLE CONTEXT & METRIC UPDATE
    // ==========================================
    return {
      ...context,
      [data.variableName]: {
        text: executionResult.text ?? "",
        modelUsed: targetModel,
        usage: executionResult.usage, 
      },
    };
  } catch (error: any) {
    throw new NonRetriableError(`Gemini node failed: ${error.message}`);
  }
};