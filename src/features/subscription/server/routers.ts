import { TRPCError } from "@trpc/server";
import z from "zod";
import { getUsage } from "@/lib/subscription/usage-counts";
import { resolveWorkspace } from "@/lib/workspaces";
import { createTRPCRouter, viewerProcedure } from "@/trpc/init";

export const subscriptionRouter = createTRPCRouter({
    // The plan of the workspace the browser is in (its owner's) and what it
    // has used. With `own`, the signed-in user's own: what Billing is about.
    // The same answer as GET /api/subscription/current, but in the page's
    // tRPC batch, so it shares the request's session and workspace lookup.
    getCurrent: viewerProcedure
        .input(z.object({ own: z.boolean().default(false) }).default({ own: false }))
        .query(async ({ ctx, input }) => {
            const workspace = input.own
                ? await resolveWorkspace(ctx.auth.user, null)
                : ctx.workspace;

            const usage = await getUsage(workspace.ownerId);

            if (!usage) {
                throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
            }

            return {
                plan: usage.plan || "FREE",
                workflowCount: usage.workflowCount,
                executionsUsed: usage.executionsUsed,
                trialEndsAt: usage.trialEndsAt,
                workspace: {
                    id: workspace.id,
                    name: workspace.name,
                    role: workspace.role,
                    personal: workspace.personal,
                },
            };
        }),
});
