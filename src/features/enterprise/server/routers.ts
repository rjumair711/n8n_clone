import { TRPCError } from "@trpc/server";
import z from "zod";
import { getRequiredPlanForFeature } from "@/config/plans";
import { recordAudit } from "@/lib/audit-log";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { readSecret } from "@/lib/external-secrets";
import {
    MAX_SECRET_STORES,
    SECRET_STORE_TYPES,
    isSecretName,
    isStoreName,
    listSecretFields,
    readAwsConfig,
    readVaultConfig,
} from "@/lib/secret-refs";
import { BlockedRequestError, parsePublicUrl } from "@/lib/ssrf";
import { getAppUrl } from "@/lib/app-url";
import { getSsoProviderLimit } from "@/lib/sso";
import {
    createTRPCRouter,
    protectedProcedure,
    viewerProcedure,
    workspaceAdminProcedure,
} from "@/trpc/init";
import {
    WORKSPACE_ENVIRONMENTS,
    isBranchName,
    isFolderPath,
    isRepoName,
} from "../lib/git-settings";
import { GitSyncError, pullWorkflows, pushWorkflows } from "./git";

// Enterprise features of a workspace: Git sync of its workflows and its
// external secret stores. Both are set up by the workspace's admins, on a
// plan that includes them. (SSO is Better Auth's sso plugin: src/lib/auth.ts.)

const refuse = (message: string): never => {
    throw new TRPCError({ code: "BAD_REQUEST", message });
};

/**
 * The plan that includes the enterprise features, when the workspace's
 * owner is not on it; null when they are.
 */
const getRequiredPlan = async (ownerId: string) => {
    const owner = await prisma.user.findUniqueOrThrow({
        where: { id: ownerId },
        select: { plan: true, trialEndsAt: true },
    });

    return getRequiredPlanForFeature("enterprise", owner.plan, owner.trialEndsAt);
};

const assertPlan = async (ownerId: string) => {
    const required = await getRequiredPlan(ownerId);

    if (required) {
        throw new TRPCError({
            code: "FORBIDDEN",
            message: `This needs the ${required} plan (the plan of the workspace's owner).`,
        });
    }
};

// What went wrong at GitHub is for the person who pressed the button
const gitError = (error: unknown): never => {
    if (error instanceof GitSyncError) {
        throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
    }

    throw error;
};

export const enterpriseRouter = createTRPCRouter({
    // SINGLE SIGN-ON
    // Whether the signed-in account may register an identity provider (a
    // provider belongs to an account, not to the workspace the browser is
    // in), and the app's address for the provider's settings
    getSso: protectedProcedure.query(async ({ ctx }) => ({
        limit: await getSsoProviderLimit(ctx.auth.user),
        appUrl: getAppUrl(),
    })),

    // GIT SYNC
    getGit: viewerProcedure.query(async ({ ctx }) => {
        const [settings, credentials, requiredPlan] = await Promise.all([
            prisma.workspaceGit.findUnique({ where: { workspaceId: ctx.workspace.id } }),
            prisma.credential.findMany({
                where: { userId: ctx.workspace.ownerId, type: "GITHUB" },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
            }),
            getRequiredPlan(ctx.workspace.ownerId),
        ]);

        return {
            requiredPlan,
            environment: ctx.workspace.environment,
            credentials,
            settings: settings && {
                repo: settings.repo,
                branch: settings.branch,
                folder: settings.folder,
                credentialId: settings.credentialId,
                lastSyncAt: settings.lastSyncAt,
                lastSyncAction: settings.lastSyncAction,
                lastCommit: settings.lastCommit,
            },
        };
    }),

    saveGit: workspaceAdminProcedure
        .input(
            z.object({
                repo: z.string().trim().refine(isRepoName, 'Enter the repository as "owner/name"'),
                branch: z.string().trim().refine(isBranchName, "Enter a branch name"),
                folder: z.string().trim().refine(isFolderPath, "Enter a folder such as workflows").default("workflows"),
                credentialId: z.string().min(1, "Pick a GitHub credential"),
                environment: z.enum(WORKSPACE_ENVIRONMENTS),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await assertPlan(ctx.workspace.ownerId);

            // A GitHub credential of this workspace
            const credential = await prisma.credential.findFirst({
                where: { id: input.credentialId, userId: ctx.workspace.ownerId, type: "GITHUB" },
                select: { id: true },
            });

            if (!credential) refuse("Pick a GitHub credential of this workspace.");

            const { environment, ...git } = input;

            await prisma.$transaction([
                prisma.workspaceGit.upsert({
                    where: { workspaceId: ctx.workspace.id },
                    update: git,
                    create: { workspaceId: ctx.workspace.id, ...git },
                }),
                prisma.workspace.update({
                    where: { id: ctx.workspace.id },
                    data: { environment },
                }),
            ]);

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "git_sync.saved",
                target: `${input.repo}, branch ${input.branch}, ${environment}`,
            });

            return { saved: true };
        }),

    // Stops the sync and makes the workspace a development one again.
    // Nothing is deleted, here or in the repository.
    removeGit: workspaceAdminProcedure.mutation(async ({ ctx }) => {
        await prisma.$transaction([
            prisma.workspaceGit.deleteMany({ where: { workspaceId: ctx.workspace.id } }),
            prisma.workspace.update({
                where: { id: ctx.workspace.id },
                data: { environment: "development" },
            }),
        ]);

        await recordAudit({
            userId: ctx.workspace.ownerId,
            actor: ctx.workspace.actor,
            action: "git_sync.removed",
            target: `Workspace "${ctx.workspace.name}"`,
        });

        return { removed: true };
    }),

    // Development only: a production workspace does not write to the branch
    pushGit: workspaceAdminProcedure
        .input(z.object({ message: z.string().trim().max(200).default("") }))
        .mutation(async ({ ctx, input }) => {
            await assertPlan(ctx.workspace.ownerId);

            if (ctx.workspace.environment === "production") {
                refuse("A production workspace only pulls. Push from the development workspace.");
            }

            const result = await pushWorkflows({
                workspaceId: ctx.workspace.id,
                ownerId: ctx.workspace.ownerId,
                message:
                    input.message ||
                    `Update workflows of ${ctx.workspace.name} (by ${ctx.auth.user.email})`,
            }).catch(gitError);

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "git_sync.pushed",
                target: `${result.files} workflows, commit ${result.commit.slice(0, 7)}`,
            });

            return result;
        }),

    pullGit: workspaceAdminProcedure.mutation(async ({ ctx }) => {
        await assertPlan(ctx.workspace.ownerId);

        const result = await pullWorkflows({
            workspaceId: ctx.workspace.id,
            ownerId: ctx.workspace.ownerId,
        }).catch(gitError);

        await recordAudit({
            userId: ctx.workspace.ownerId,
            actor: ctx.workspace.actor,
            action: "git_sync.pulled",
            target: `${result.created} new, ${result.updated} updated, commit ${result.commit.slice(0, 7)}`,
        });

        return result;
    }),

    // EXTERNAL SECRETS
    // The stores, by name and type. What reaches them (the token, the
    // keys) is never sent back.
    getSecretStores: viewerProcedure.query(async ({ ctx }) => {
        const [stores, requiredPlan] = await Promise.all([
            prisma.secretStore.findMany({
                where: { workspaceId: ctx.workspace.id },
                orderBy: { name: "asc" },
                select: { id: true, name: true, type: true, updatedAt: true },
            }),
            getRequiredPlan(ctx.workspace.ownerId),
        ]);

        return { requiredPlan, stores };
    }),

    saveSecretStore: workspaceAdminProcedure
        .input(
            z.object({
                // Absent: a new store
                id: z.string().optional(),
                name: z.string().trim().toLowerCase().refine(isStoreName, "Use lower case letters, digits, - and _, starting with a letter"),
                type: z.enum(SECRET_STORE_TYPES),
                config: z.record(z.string(), z.string().max(5000)),
            })
        )
        .mutation(async ({ ctx, input }) => {
            await assertPlan(ctx.workspace.ownerId);

            const config =
                input.type === "vault" ? readVaultConfig(input.config) : readAwsConfig(input.config);

            if ("error" in config) return refuse(config.error);

            if ("url" in config) {
                // Refused now, not when the first workflow runs
                try {
                    parsePublicUrl(config.url);
                } catch (error) {
                    return refuse(
                        error instanceof BlockedRequestError
                            ? `The Vault's address cannot be used: ${error.message}`
                            : "The Vault's address is not a URL."
                    );
                }
            }

            const data = {
                name: input.name,
                type: input.type,
                config: encrypt(JSON.stringify(config)),
            };

            try {
                if (input.id) {
                    // Of this workspace: another workspace's id changes nothing
                    const updated = await prisma.secretStore.updateMany({
                        where: { id: input.id, workspaceId: ctx.workspace.id },
                        data,
                    });

                    if (updated.count === 0) {
                        throw new TRPCError({ code: "NOT_FOUND", message: "Secret store not found." });
                    }
                } else {
                    const count = await prisma.secretStore.count({
                        where: { workspaceId: ctx.workspace.id },
                    });

                    if (count >= MAX_SECRET_STORES) {
                        refuse(`A workspace can have ${MAX_SECRET_STORES} secret stores.`);
                    }

                    await prisma.secretStore.create({
                        data: {
                            ...data,
                            workspaceId: ctx.workspace.id,
                            userId: ctx.workspace.ownerId,
                        },
                    });
                }
            } catch (error) {
                if ((error as { code?: string })?.code === "P2002") {
                    return refuse(`This workspace already has a secret store named "${input.name}".`);
                }

                throw error;
            }

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "secret_store.saved",
                // The name and the kind, never what reaches it
                target: `${input.type} store "${input.name}"`,
            });

            return { name: input.name };
        }),

    removeSecretStore: workspaceAdminProcedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ ctx, input }) => {
            const store = await prisma.secretStore.findFirst({
                where: { id: input.id, workspaceId: ctx.workspace.id },
                select: { id: true, name: true, type: true },
            });

            if (!store) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Secret store not found." });
            }

            await prisma.secretStore.delete({ where: { id: store.id } });

            await recordAudit({
                userId: ctx.workspace.ownerId,
                actor: ctx.workspace.actor,
                action: "secret_store.deleted",
                target: `${store.type} store "${store.name}"`,
            });

            return { id: store.id };
        }),

    // Reads one secret to see that the store answers. Sends back the names
    // of its fields, never a value.
    testSecret: workspaceAdminProcedure
        .input(
            z.object({
                id: z.string(),
                secret: z.string().trim().refine(isSecretName, "Enter the secret's path or name"),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const store = await prisma.secretStore.findFirst({
                where: { id: input.id, workspaceId: ctx.workspace.id },
                select: { id: true, name: true, type: true, config: true, updatedAt: true },
            });

            if (!store) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Secret store not found." });
            }

            try {
                const payload = await readSecret(store, input.secret);

                return { found: true as const, fields: listSecretFields(payload) };
            } catch (error) {
                // The store's own words about what went wrong, which name the
                // secret and the store, not a value
                return { found: false as const, error: (error as Error).message };
            }
        }),
});
