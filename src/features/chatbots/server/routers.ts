import { randomUUID } from "crypto";
import { CredentialType, NodeType, type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@/lib/db";
import { createTRPCRouter, editorProcedure, viewerProcedure } from "@/trpc/init";
import { PLAN_LIMITS, getRequiredPlanForNode } from "@/config/plans";
import { INCLUDED_CREDENTIAL_ID } from "@/config/ai-credits";
import { getAppUrl } from "@/lib/app-url";
import { listIncludedProviders } from "@/lib/ai-credits";
import { assertOwnership } from "@/lib/ownership";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";
import { CHATBOT_SOURCE_RATE_LIMIT, consumeRateLimit } from "@/lib/rate-limit";
import { buildChatPageUrl, buildEmbedSnippet } from "@/lib/chat-widget";
import {
    CHATBOT_COLLECTION_PREFIX,
    CHATBOT_EMBEDDING_PROVIDERS,
    CHATBOT_MAX_FILE_BYTES,
    CHATBOT_MAX_INSTRUCTIONS_LENGTH,
    CHATBOT_MAX_NAME_LENGTH,
    CHATBOT_MAX_SOURCES,
    CHATBOT_MAX_URL_LENGTH,
    buildChatbotGraph,
    buildWhatsappNodes,
    buildWhatsappWebhookUrl,
    parseUrlList,
    readChatbot,
    resolveChatbotModel,
    type ChatbotConnection,
    type ChatbotNode,
    type ChatbotWhatsapp,
} from "../lib/chatbot";
import {
    addSource,
    listSources,
    readFileSource,
    readUrlSource,
    removeSource,
} from "./knowledge";

// "Create a chatbot": makes an ordinary workflow (Chat Trigger, AI Agent,
// Chat Model, Memory, Vector Store) and fills its knowledge base. The page
// of a chatbot reads everything back from the workflow's nodes, so a
// chatbot that was changed in the editor still works here.

const whatsappInput = z.object({
    credentialId: z.string().min(1).max(100),
    appSecret: z.string().trim().min(1).max(200),
    verifyToken: z.string().trim().min(8).max(200),
});

const refuse = (message: string, code: "BAD_REQUEST" | "FORBIDDEN" = "BAD_REQUEST"): never => {
    throw new TRPCError({ code, message });
};

const loadUser = (userId: string) =>
    prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { plan: true, trialEndsAt: true },
    });

// The workflow of a chatbot, with what the page reads from its nodes
const loadChatbot = async (id: string, userId: string) => {
    const workflow = assertOwnership(
        await prisma.workflow.findUnique({
            where: { id },
            include: {
                nodes: { select: { id: true, type: true, data: true, position: true } },
                connections: { select: { fromNodeId: true, toNodeId: true, toInput: true } },
            },
        }),
        userId,
        "Chatbot"
    );

    const parts = readChatbot(workflow.nodes, workflow.connections);

    if (!parts) {
        throw new TRPCError({
            code: "NOT_FOUND",
            message: "This workflow is not a chatbot: it has no Chat Trigger that leads to an AI Agent.",
        });
    }

    return { workflow, parts };
};

// The same check for both ways of adding to the knowledge base
const beforeAddingSource = async (id: string, userId: string) => {
    const { allowed, retryAfterSeconds } = await consumeRateLimit(
        `chatbot-source:${userId}`,
        CHATBOT_SOURCE_RATE_LIMIT
    );

    if (!allowed) {
        throw new TRPCError({
            code: "TOO_MANY_REQUESTS",
            message: `Too many documents at once. Try again in ${retryAfterSeconds} seconds.`,
        });
    }

    const { parts } = await loadChatbot(id, userId);

    if (!parts.store) {
        return refuse(
            "This chatbot has no knowledge base: its AI Agent has no Vector Store (Search Documents) on the Tools port. Add one in the editor."
        );
    }

    return parts.store;
};

// What the WhatsApp side needs: a plan that has it, and the user's own
// WhatsApp credential
const checkWhatsapp = async (
    userId: string,
    user: { plan: keyof typeof PLAN_LIMITS; trialEndsAt: Date | null },
    whatsapp: z.infer<typeof whatsappInput>
): Promise<ChatbotWhatsapp> => {
    const requiredPlan = getRequiredPlanForNode(
        NodeType.WHATSAPP_TRIGGER,
        user.plan,
        user.trialEndsAt
    );

    if (requiredPlan) {
        return refuse(`WhatsApp requires the ${requiredPlan} plan.`, "FORBIDDEN");
    }

    const credential = await prisma.credential.findFirst({
        where: { id: whatsapp.credentialId, userId, type: CredentialType.WHATSAPP },
        select: { id: true },
    });

    if (!credential) return refuse("Pick one of your WhatsApp credentials.");

    return {
        credentialId: credential.id,
        appSecret: whatsapp.appSecret,
        verifyToken: whatsapp.verifyToken,
    };
};

const readPosition = (value: unknown) => {
    const position = value as { x?: unknown; y?: unknown } | null;

    return typeof position?.x === "number" && typeof position?.y === "number"
        ? { x: position.x, y: position.y }
        : undefined;
};

const toNodeRows = (workflowId: string, nodes: ChatbotNode[]) =>
    nodes.map((node) => ({
        id: node.id,
        workflowId,
        name: node.type,
        type: node.type as NodeType,
        position: node.position,
        data: node.data as Prisma.InputJsonValue,
        credentialId: node.credentialId ?? null,
    }));

const toConnectionRows = (workflowId: string, connections: ChatbotConnection[]) =>
    connections.map((connection) => ({ workflowId, ...connection }));

export const chatbotsRouter = createTRPCRouter({
    /**
     * What the "Create a chatbot" page offers this user: the credentials
     * that can embed documents or send on WhatsApp (never their secrets),
     * and what the plan allows.
     */
    getOptions: viewerProcedure.query(async ({ ctx }) => {
        const userId = ctx.workspace.ownerId;

        const [user, credentials, workflowCount] = await Promise.all([
            loadUser(userId),
            prisma.credential.findMany({
                where: {
                    userId,
                    type: {
                        in: [CredentialType.OPENAI, CredentialType.GEMINI, CredentialType.WHATSAPP],
                    },
                },
                orderBy: { updatedAt: "desc" },
                select: { id: true, name: true, type: true },
            }),
            prisma.workflow.count({ where: { userId } }),
        ]);

        const workflowLimit = PLAN_LIMITS[user.plan].activeWorkflows;

        return {
            embeddingCredentials: credentials.filter(
                (credential) => credential.type in CHATBOT_EMBEDDING_PROVIDERS
            ),
            whatsappCredentials: credentials.filter(
                (credential) => credential.type === CredentialType.WHATSAPP
            ),
            // The plan a feature needs, or null when the user has it
            agentPlan: getRequiredPlanForNode(NodeType.AI_AGENT, user.plan, user.trialEndsAt),
            whatsappPlan: getRequiredPlanForNode(
                NodeType.WHATSAPP_TRIGGER,
                user.plan,
                user.trialEndsAt
            ),
            workflowLimitReached: workflowCount >= workflowLimit,
            workflowLimit: Number.isFinite(workflowLimit) ? workflowLimit : null,
        };
    }),

    // The user's chatbots: workflows whose knowledge base was made here
    list: viewerProcedure.query(async ({ ctx }) => {
        const workflows = await prisma.workflow.findMany({
            where: {
                userId: ctx.workspace.ownerId,
                nodes: {
                    some: {
                        type: NodeType.VECTOR_STORE,
                        data: { path: ["collection"], string_starts_with: CHATBOT_COLLECTION_PREFIX },
                    },
                },
            },
            orderBy: { updatedAt: "desc" },
            take: 50,
            select: { id: true, name: true, active: true, updatedAt: true },
        });

        return workflows;
    }),

    /**
     * Creates the chatbot's workflow and switches it on: the widget and the
     * share link only work for an active workflow. Documents and pages are
     * added afterwards, one request each.
     */
    create: editorProcedure
        .input(
            z.object({
                name: z.string().trim().min(1).max(CHATBOT_MAX_NAME_LENGTH),
                instructions: z.string().max(CHATBOT_MAX_INSTRUCTIONS_LENGTH).optional(),
                welcomeMessage: z.string().max(1000).optional(),
                model: z.object({
                    credentialId: z.string().min(1).max(100),
                    model: z.string().trim().max(200).optional(),
                    provider: z.string().trim().max(40).optional(),
                    baseUrl: z.string().trim().max(500).optional(),
                }),
                embeddingCredentialId: z.string().min(1).max(100),
                whatsapp: whatsappInput.optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;
            const user = await loadUser(userId);

            // A chatbot that could not run is not made
            const agentPlan = getRequiredPlanForNode(
                NodeType.AI_AGENT,
                user.plan,
                user.trialEndsAt
            );

            if (agentPlan) {
                return refuse(`A chatbot uses an AI Agent, which requires the ${agentPlan} plan.`, "FORBIDDEN");
            }

            const workflowLimit = PLAN_LIMITS[user.plan].activeWorkflows;

            if ((await prisma.workflow.count({ where: { userId } })) >= workflowLimit) {
                return refuse(
                    `Workflow limit reached. Your current plan allows up to ${workflowLimit} workflows.`,
                    "FORBIDDEN"
                );
            }

            // The chat model: "rxj-ai:<provider>", or one of the user's own
            // credentials
            const isIncluded = input.model.credentialId.startsWith(`${INCLUDED_CREDENTIAL_ID}:`);

            const modelCredential = isIncluded
                ? { id: input.model.credentialId, type: INCLUDED_CREDENTIAL_ID }
                : await prisma.credential.findFirst({
                      where: { id: input.model.credentialId, userId },
                      select: { id: true, type: true },
                  });

            if (!modelCredential) return refuse("Pick one of your model credentials.");

            const model = resolveChatbotModel({
                credential: modelCredential,
                model: input.model.model,
                provider: input.model.provider,
                baseUrl: input.model.baseUrl,
                included: isIncluded ? await listIncludedProviders() : [],
            });

            if ("problem" in model) return refuse(model.problem);

            const embeddingCredential = await prisma.credential.findFirst({
                where: { id: input.embeddingCredentialId, userId },
                select: { id: true, type: true },
            });
            const embeddingProvider = embeddingCredential
                ? CHATBOT_EMBEDDING_PROVIDERS[embeddingCredential.type]
                : undefined;

            if (!embeddingCredential || !embeddingProvider) {
                return refuse("Pick an OpenAI or Gemini credential for the knowledge base.");
            }

            const whatsapp = input.whatsapp
                ? await checkWhatsapp(userId, user, input.whatsapp)
                : undefined;

            const graph = buildChatbotGraph({
                newId: randomUUID,
                name: input.name,
                instructions: input.instructions,
                welcomeMessage: input.welcomeMessage,
                model,
                embedding: { provider: embeddingProvider, credentialId: embeddingCredential.id },
                // Its own set of documents, whatever the chatbot is called
                collection: `${CHATBOT_COLLECTION_PREFIX}${randomUUID().slice(0, 12)}`,
                whatsapp,
            });

            const workflow = await prisma.$transaction(async (tx) => {
                const created = await tx.workflow.create({
                    data: { name: input.name, userId, workspaceId: ctx.workspace.id, active: true },
                });

                await tx.node.createMany({ data: toNodeRows(created.id, graph.nodes) });
                await tx.connection.createMany({
                    data: toConnectionRows(created.id, graph.connections),
                });
                await tx.user.update({
                    where: { id: userId },
                    data: { workflowCount: { increment: 1 } },
                });

                return created;
            });

            await recordAudit({
                userId,
                action: "workflow.activated",
                target: describeAuditTarget("Workflow", workflow),
            });

            return { id: workflow.id };
        }),

    // Everything the chatbot's page shows
    get: viewerProcedure
        .input(z.object({ id: z.string().min(1).max(100) }))
        .query(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;
            const { workflow, parts } = await loadChatbot(input.id, userId);
            const appUrl = getAppUrl();
            const user = await loadUser(userId);

            return {
                id: workflow.id,
                name: workflow.name,
                active: workflow.active,
                embedSnippet: buildEmbedSnippet(appUrl, parts.chatTriggerId),
                chatUrl: buildChatPageUrl(appUrl, parts.chatTriggerId),
                // The chat is only public while this is on (Chat Trigger)
                chatPublic:
                    (workflow.nodes.find((node) => node.id === parts.chatTriggerId)?.data as
                        | { chatPublic?: unknown }
                        | null)?.chatPublic === true,
                whatsapp: parts.whatsapp
                    ? {
                          webhookUrl: buildWhatsappWebhookUrl(appUrl, workflow.id),
                          // Typed into Meta by the owner. The App Secret is
                          // never sent back.
                          verifyToken: parts.whatsapp.verifyToken,
                          hasAppSecret: parts.whatsapp.hasAppSecret,
                      }
                    : null,
                whatsappPlan: getRequiredPlanForNode(
                    NodeType.WHATSAPP_TRIGGER,
                    user.plan,
                    user.trialEndsAt
                ),
                knowledge: parts.store
                    ? {
                          collection: parts.store.collection,
                          sources: await listSources(userId, parts.store.collection),
                      }
                    : null,
                limits: {
                    maxSources: CHATBOT_MAX_SOURCES,
                    maxFileBytes: CHATBOT_MAX_FILE_BYTES,
                },
            };
        }),

    // One web page into the knowledge base
    addUrl: editorProcedure
        .input(
            z.object({
                id: z.string().min(1).max(100),
                url: z.string().trim().min(1).max(CHATBOT_MAX_URL_LENGTH),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;
            const { urls } = parseUrlList(input.url);

            if (urls.length !== 1) return refuse(`"${input.url}" is not a web address.`);

            const store = await beforeAddingSource(input.id, userId);

            return addSource({ userId, store, source: await readUrlSource(urls[0]) });
        }),

    // One document into the knowledge base
    addFile: editorProcedure
        .input(
            z.object({
                id: z.string().min(1).max(100),
                fileName: z.string().trim().min(1).max(200),
                // base64 is a third longer than the file
                contentBase64: z.string().min(1).max(Math.ceil(CHATBOT_MAX_FILE_BYTES / 3) * 4 + 4),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;
            const store = await beforeAddingSource(input.id, userId);

            const source = await readFileSource(
                input.fileName,
                Buffer.from(input.contentBase64, "base64")
            );

            return addSource({ userId, store, source });
        }),

    removeSource: editorProcedure
        .input(
            z.object({
                id: z.string().min(1).max(100),
                sourceId: z.string().min(1).max(700),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;
            const { parts } = await loadChatbot(input.id, userId);

            if (!parts.store) return { removed: 0 };

            return {
                removed: await removeSource(userId, parts.store.collection, input.sourceId),
            };
        }),

    /**
     * Adds the WhatsApp side to a chatbot that does not have it: a WhatsApp
     * Trigger into the same agent, and the reply after it.
     */
    connectWhatsapp: editorProcedure
        .input(whatsappInput.extend({ id: z.string().min(1).max(100) }))
        .mutation(async ({ ctx, input }) => {
            const userId = ctx.workspace.ownerId;
            const { workflow, parts } = await loadChatbot(input.id, userId);

            if (parts.whatsapp) {
                return refuse(
                    "This chatbot already has a WhatsApp Trigger. Change it in the editor."
                );
            }

            const whatsapp = await checkWhatsapp(userId, await loadUser(userId), input);
            const added = buildWhatsappNodes({
                newId: randomUUID,
                agentId: parts.agentId,
                agentPosition: readPosition(
                    workflow.nodes.find((node) => node.id === parts.agentId)?.position
                ),
                whatsapp,
            });

            await prisma.$transaction([
                prisma.node.createMany({ data: toNodeRows(workflow.id, added.nodes) }),
                prisma.connection.createMany({
                    data: toConnectionRows(workflow.id, added.connections),
                }),
                prisma.workflow.update({
                    where: { id: workflow.id },
                    data: { updatedAt: new Date() },
                }),
            ]);

            return { webhookUrl: buildWhatsappWebhookUrl(getAppUrl(), workflow.id) };
        }),
});
