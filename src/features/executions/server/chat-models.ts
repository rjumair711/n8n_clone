import { CredentialType } from "@prisma/client";
import z from "zod";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { assertOwnership } from "@/lib/ownership";
import { redactString } from "@/lib/redaction";
import { safeFetch } from "@/lib/ssrf";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import {
    DEDICATED_CHAT_MODEL_NODES,
    parseModelList,
    resolveChatModelEndpoint,
    withDedicatedProvider,
} from "../lib/chat-model-providers";

const REQUEST_TIMEOUT_MS = 10_000;
// A model list is a few hundred KB at most (OpenRouter's is the largest)
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;

// The credential a node type signs in with. The key is only ever sent to
// the provider it was saved for.
const CREDENTIAL_TYPES: Record<string, CredentialType> = {
    CHAT_MODEL: CredentialType.OPENAI_COMPATIBLE,
    DEEPSEEK: CredentialType.DEEPSEEK,
    KIMI: CredentialType.KIMI,
    QWEN: CredentialType.QWEN,
};

type ModelListResult = {
    models: string[];
    // "provider": the provider's own list. "preset": the built-in list,
    // because the provider's could not be loaded.
    source: "provider" | "preset";
    // Why the provider's list could not be loaded
    error?: string;
};

export const chatModelsRouter = createTRPCRouter({
    /**
     * "Load models": asks the provider for its model list (GET /models, the
     * OpenAI way) with the node's credential. Never fails because of the
     * provider: when the list cannot be loaded, the preset's models come
     * back with the reason.
     */
    list: protectedProcedure
        .input(
            z.object({
                nodeType: z.enum(["CHAT_MODEL", "DEEPSEEK", "KIMI", "QWEN"]),
                credentialId: z.string().min(1),
                provider: z.string().max(60).optional(),
                baseUrl: z.string().max(500).optional(),
            })
        )
        .mutation(async ({ ctx, input }): Promise<ModelListResult> => {
            const credential = assertOwnership(
                await prisma.credential.findUnique({
                    where: { id: input.credentialId },
                    select: { userId: true, type: true, value: true },
                }),
                ctx.auth.user.id,
                "Credential"
            );

            const data = input.nodeType in DEDICATED_CHAT_MODEL_NODES
                ? withDedicatedProvider(input.nodeType, { baseUrl: input.baseUrl })
                : { provider: input.provider, baseUrl: input.baseUrl };

            const endpoint = resolveChatModelEndpoint(data);
            const preset = endpoint?.provider.models ?? [];

            const fallback = (error: string): ModelListResult => ({
                models: preset,
                source: "preset",
                error,
            });

            if (credential.type !== CREDENTIAL_TYPES[input.nodeType]) {
                return fallback("That credential is of another type than this node uses.");
            }
            if (!endpoint) return fallback("Unknown provider.");
            if (!endpoint.baseUrl) return fallback("Enter the base URL first.");

            let apiKey = "";

            try {
                apiKey = decrypt(credential.value).trim();

                // The base URL can be typed in, so it goes through the same
                // guard as the node itself when it runs
                const response = await safeFetch(`${endpoint.baseUrl}/models`, {
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        Accept: "application/json",
                    },
                    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
                });

                if (!response.ok) {
                    return fallback(
                        response.status === 401 || response.status === 403
                            ? `The provider refused the API key (HTTP ${response.status}).`
                            : response.status === 404
                              ? "This provider has no model list (HTTP 404)."
                              : `The provider answered HTTP ${response.status}.`
                    );
                }

                const declared = Number(response.headers.get("content-length"));
                if (declared > MAX_RESPONSE_BYTES) return fallback("The model list is too large.");

                const text = await response.text();
                if (text.length > MAX_RESPONSE_BYTES) return fallback("The model list is too large.");

                const models = parseModelList(JSON.parse(text));

                return models.length > 0
                    ? { models, source: "provider" }
                    : fallback("The provider's answer had no models in it.");
            } catch (error) {
                const message = error instanceof Error ? error.message : "unknown error";

                // An error text can quote the request: the key never leaves
                // the server, whatever the error says
                return fallback(
                    redactString(message, { secrets: apiKey ? [apiKey] : [] }).slice(0, 200)
                );
            }
        }),
});
