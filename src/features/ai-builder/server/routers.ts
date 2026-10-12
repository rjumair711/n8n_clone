import { readCredentialValue } from "@/lib/external-secrets";
import { createId } from "@paralleldrive/cuid2";
import { NodeType, type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { generateText } from "ai";
import { generateSlug } from "random-word-slugs";
import z from "zod";
import { PLAN_LIMITS, getRequiredPlanForNode } from "@/config/plans";
import {
    DEFAULT_MODELS,
    buildLanguageModel,
    getUsageProvider,
    type ModelProvider,
} from "@/features/executions/lib/connected-model";
import { withDedicatedProvider } from "@/features/executions/lib/chat-model-providers";
import { normalizeUsage } from "@/lib/ai-cost";
import {
    BUILDER_USAGE_NAME,
    getAccountAiBudgetProblem,
    recordAccountAiUsage,
} from "@/lib/ai-usage";
import { INCLUDED_CREDENTIAL_ID } from "@/config/ai-credits";
import { listIncludedProviders, loadIncludedKeys } from "@/lib/ai-credits";
import prisma from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { assertOwnership } from "@/lib/ownership";
import { AI_BUILDER_RATE_LIMIT, consumeRateLimit } from "@/lib/rate-limit";
import { redactString } from "@/lib/redaction";
import { createTRPCRouter, editorProcedure, builderProcedure } from "@/trpc/init";
import {
    BUILDER_CREDENTIAL_TYPES,
    isBuilderCredentialType,
    type BuilderCredentialType,
} from "../lib/builder-models";
import { catalogueSchema, type CatalogueNode } from "../lib/catalogue";
import { generateWorkflow, type CallModel } from "../lib/generate";
import { MAX_DESCRIPTION_LENGTH, MAX_HISTORY } from "../lib/prompt";
import {
    describeCurrentWorkflow,
    toEditorGraph,
    type EditorNode,
} from "../lib/workflow";

// The request has to finish inside the serverless function's time limit
// (see maxDuration in src/app/api/trpc/[trpc]/route.ts), and the second
// attempt needs enough of it left to be worth starting
const TIME_BUDGET_MS = 55_000;
const MIN_ATTEMPT_MS = 8_000;

const NODE_TYPES = new Set<string>(Object.values(NodeType));

// Also the model of an evaluation's LLM judge (src/features/evaluations)
export const modelInput = z.object({
    credentialId: z.string().min(1, "Pick a credential"),
    // Empty: the default model of the credential's provider
    model: z.string().trim().max(200).optional(),
    // For an OpenAI-compatible credential: the Chat Model provider preset,
    // and the base URL for "custom" or another Ollama host
    provider: z.string().max(60).optional(),
    baseUrl: z.string().trim().max(500).optional(),
});

const builderInput = {
    description: z
        .string()
        .trim()
        .min(3, "Describe the workflow")
        .max(MAX_DESCRIPTION_LENGTH),
    // Built in the browser from the node registry (see
    // components/node-catalogue.ts)
    catalogue: catalogueSchema,
    model: modelInput,
};

const currentInput = z.object({
    nodes: z
        .array(
            z.object({
                id: z.string().min(1).max(80),
                type: z.string().min(1).max(60),
                position: z.object({ x: z.number(), y: z.number() }),
                data: z.record(z.string(), z.any()).default({}),
            })
        )
        .max(200),
    edges: z
        .array(
            z.object({
                source: z.string(),
                target: z.string(),
                sourceHandle: z.string().nullish(),
                targetHandle: z.string().nullish(),
            })
        )
        .max(600),
});

const PROVIDERS: Record<BuilderCredentialType, ModelProvider> = {
    OPENAI: "OPENAI",
    ANTHROPIC: "ANTHROPIC",
    GEMINI: "GEMINI",
    DEEPSEEK: "COMPATIBLE",
    KIMI: "COMPATIBLE",
    QWEN: "COMPATIBLE",
    OPENAI_COMPATIBLE: "COMPATIBLE",
};

/**
 * The model the builder calls: one of the user's own credentials, the same
 * way the model nodes use it. Returns the API key too, so an error message
 * that repeats it can be cleaned.
 */
export const loadBuilderModel = async (
    userId: string,
    input: z.infer<typeof modelInput>,
    // What the call is for, in the message when included AI cannot be used
    label = "Build with AI"
) => {
    // "RXJ AI (included)": the platform's key, paid with the user's AI
    // credits. The dialog sends "rxj-ai:<provider>".
    if (input.credentialId.startsWith(`${INCLUDED_CREDENTIAL_ID}:`)) {
        const provider = input.credentialId.slice(INCLUDED_CREDENTIAL_ID.length + 1);
        const offered = (await listIncludedProviders()).find(
            (entry) => entry.provider === provider
        );
        const modelName = input.model || offered?.models[0] || "";

        let keys: Record<string, string>;
        try {
            // Refuses a model that is not offered, and a user without credits
            keys = await loadIncludedKeys({
                label,
                userId,
                models: [{ provider, model: modelName }],
            });
        } catch (error) {
            throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: (error as Error).message,
            });
        }

        const apiKey = decrypt(keys[provider]).trim();

        return {
            apiKey,
            modelName,
            usageProvider: provider,
            included: true,
            // The preset's own address, whatever the request says
            model: buildLanguageModel("COMPATIBLE", apiKey, modelName, {
                provider,
                model: modelName,
                baseUrl: "",
            }),
        };
    }

    const credential = assertOwnership(
        await prisma.credential.findUnique({
            where: { id: input.credentialId },
            select: { userId: true, type: true, value: true },
        }),
        userId,
        "Credential"
    );

    if (!isBuilderCredentialType(credential.type)) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "That credential is not for a chat model.",
        });
    }

    // With what it reads from an external secret store read
    const apiKey = (await readCredentialValue(credential.value, userId)).trim();
    const provider = PROVIDERS[credential.type];

    // A DeepSeek, Kimi or Qwen credential names its provider; a Chat Model
    // credential takes the one picked in the dialog
    const modelData =
        credential.type === "OPENAI_COMPATIBLE"
            ? { provider: input.provider, baseUrl: input.baseUrl, model: input.model }
            : withDedicatedProvider(credential.type, { model: input.model });

    const modelName =
        input.model || (modelData.model as string | undefined) || DEFAULT_MODELS[provider];

    if (!modelName) {
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Enter the model to use.",
        });
    }

    try {
        return {
            apiKey,
            modelName,
            included: false,
            // What the calls are written down and priced under
            usageProvider: getUsageProvider(provider, modelData),
            model: buildLanguageModel(provider, apiKey, modelName, {
                ...modelData,
                model: modelName,
            }),
        };
    } catch (error) {
        // An unknown provider, or a custom one without a base URL
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: (error as Error).message.replace(/^Chat Model node: /, ""),
        });
    }
};

/**
 * Describe -> model -> check -> (once more) for one request. Everything
 * that decides what the user may use is decided here, not in the catalogue
 * the browser sent: which node types exist, and which the plan includes.
 */
const runBuilder = async ({
    userId,
    input,
    current,
    history,
}: {
    userId: string;
    input: {
        description: string;
        catalogue: CatalogueNode[];
        model: z.infer<typeof modelInput>;
    };
    current?: z.infer<typeof currentInput>;
    history?: string[];
}) => {
    const { allowed, retryAfterSeconds } = await consumeRateLimit(
        `ai-builder:${userId}`,
        AI_BUILDER_RATE_LIMIT
    );

    if (!allowed) {
        throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many requests. Try again in ${retryAfterSeconds} seconds.`,
        });
    }

    const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { plan: true, trialEndsAt: true },
    });

    const currentNodes = (current?.nodes ?? []) as EditorNode[];
    // A node that is on the canvas already stays usable, whatever the plan
    const onCanvas = new Set(currentNodes.map((node) => node.type));

    const lockedTypes: Record<string, string> = {};
    const catalogue = input.catalogue.filter((entry) => {
        if (!NODE_TYPES.has(entry.type) || entry.type === NodeType.INITIAL) {
            return false;
        }

        const requiredPlan = getRequiredPlanForNode(
            entry.type,
            user.plan,
            user.trialEndsAt
        );

        if (requiredPlan && !onCanvas.has(entry.type)) {
            lockedTypes[entry.type] = requiredPlan;
            return false;
        }

        return true;
    });

    // The account's monthly AI budget stops the builder like it stops a node
    const budgetProblem = await getAccountAiBudgetProblem(userId);
    if (budgetProblem) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: budgetProblem });
    }

    const { model, modelName, usageProvider, apiKey, included } = await loadBuilderModel(
        userId,
        input.model
    );
    const described = describeCurrentWorkflow(currentNodes, current?.edges ?? []);

    const deadline = Date.now() + TIME_BUDGET_MS;

    const callModel: CallModel = async ({ system, messages }) => {
        const remaining = deadline - Date.now();

        if (remaining < MIN_ATTEMPT_MS) {
            throw new TRPCError({
                code: "TIMEOUT",
                message:
                    "The model took too long. Try again, with a shorter description or a faster model.",
            });
        }

        const result = await generateText({
            model,
            system,
            messages,
            abortSignal: AbortSignal.timeout(remaining),
            maxRetries: 1,
        });

        // On the usage page under "Build with AI", and part of the month's spend
        await recordAccountAiUsage({
            userId,
            name: BUILDER_USAGE_NAME,
            provider: usageProvider,
            model: modelName,
            usage: normalizeUsage(result.totalUsage),
            included,
        });

        return result.text;
    };

    let result;
    try {
        result = await generateWorkflow({
            callModel,
            catalogue,
            lockedTypes,
            description: input.description,
            current: described.workflow.nodes.length > 0 ? described.workflow : undefined,
            history,
        });
    } catch (error) {
        if (error instanceof TRPCError) throw error;

        const name = (error as Error)?.name;
        if (name === "TimeoutError" || name === "AbortError") {
            throw new TRPCError({
                code: "TIMEOUT",
                message:
                    "The model took too long. Try again, with a shorter description or a faster model.",
            });
        }

        // The provider's own words (a wrong key, an unknown model), never
        // with the key in them
        throw new TRPCError({
            code: "BAD_REQUEST",
            message: `The model could not be used: ${redactString(
                String((error as Error)?.message ?? error),
                { secrets: [apiKey] }
            ).slice(0, 300)}`,
        });
    }

    if (!result.ok) {
        return { ok: false as const, errors: result.errors.slice(0, 20) };
    }

    return {
        ok: true as const,
        attempts: result.attempts,
        graph: toEditorGraph({
            workflow: result.workflow,
            catalogue,
            current: currentNodes,
            idByAlias: described.idByAlias,
            createId,
        }),
    };
};

export const aiBuilderRouter = createTRPCRouter({
    // The user's credentials that can call a chat model, for the dialog's
    // "Model" list. Never the secrets.
    getModelCredentials: editorProcedure.query(async ({ ctx }) => {
        const [own, included] = await Promise.all([
            prisma.credential.findMany({
                where: {
                    userId: ctx.workspace.ownerId,
                    type: { in: [...BUILDER_CREDENTIAL_TYPES] },
                },
                orderBy: { updatedAt: "desc" },
                select: { id: true, name: true, type: true },
            }),
            listIncludedProviders(),
        ]);

        return [
            ...own.map((credential) => ({
                ...credential,
                type: credential.type as string,
                models: [] as string[],
            })),
            // "RXJ AI (included)", once per provider it offers: paid with
            // the user's AI credits instead of a key of their own
            ...included.map((entry) => ({
                id: `${INCLUDED_CREDENTIAL_ID}:${entry.provider}`,
                name: `RXJ AI (included): ${entry.label}`,
                type: INCLUDED_CREDENTIAL_ID,
                models: entry.models,
            })),
        ];
    }),

    /**
     * For the editor: builds a workflow from a description, or changes the
     * one on the canvas. Nothing is saved: the editor shows the result and
     * the user saves it, or undoes it.
     */
    generate: editorProcedure
        .input(
            z.object({
                ...builderInput,
                current: currentInput.optional(),
                history: z
                    .array(z.string().max(MAX_DESCRIPTION_LENGTH))
                    .max(MAX_HISTORY)
                    .optional(),
            })
        )
        .mutation(({ ctx, input }) =>
            runBuilder({
                userId: ctx.workspace.ownerId,
                input,
                current: input.current,
                history: input.history,
            })
        ),

    /**
     * For the workflows list: builds a workflow from a description and
     * saves it as a new, inactive workflow.
     */
    createWorkflow: builderProcedure
        .input(z.object(builderInput))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;

            const user = await prisma.user.findUniqueOrThrow({
                where: { id: userId },
                select: { plan: true },
            });

            // Checked before the model is called, which costs the user money
            const workflowLimit = PLAN_LIMITS[user.plan].activeWorkflows;
            const workflowCount = await prisma.workflow.count({ where: { userId } });

            if (workflowCount >= workflowLimit) {
                throw new TRPCError({
                    code: "FORBIDDEN",
                    message: `Workflow limit reached. Your current plan allows up to ${workflowLimit} workflows.`,
                });
            }

            const result = await runBuilder({ userId, input });
            if (!result.ok) return result;

            const { graph } = result;

            const workflow = await prisma.$transaction(async (tx) => {
                // `active` is left at its default, false: a generated
                // workflow never runs before its owner has looked at it
                const created = await tx.workflow.create({
                    data: { name: graph.name || generateSlug(3), userId, workspaceId: ctx.workspace.id },
                });

                await tx.node.createMany({
                    data: graph.nodes.map((node) => ({
                        id: node.id,
                        workflowId: created.id,
                        name: node.type,
                        type: node.type as NodeType,
                        position: node.position,
                        data: node.data as Prisma.InputJsonValue,
                    })),
                });

                await tx.connection.createMany({
                    data: graph.edges.map((edge) => ({
                        workflowId: created.id,
                        fromNodeId: edge.source,
                        toNodeId: edge.target,
                        fromOutput: edge.sourceHandle,
                        toInput: edge.targetHandle,
                    })),
                });

                await tx.user.update({
                    where: { id: userId },
                    data: { workflowCount: { increment: 1 } },
                });

                return created;
            });

            return {
                ok: true as const,
                id: workflow.id,
                name: workflow.name,
                summary: graph.summary,
                todo: graph.todo,
            };
        }),
});
