import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { decideApproval, listPendingApprovals } from "./requests";

export const approvalsRouter = createTRPCRouter({
    // The requests the user can still answer; with an execution id, only
    // that execution's
    getPending: protectedProcedure
        .input(z.object({ executionId: z.string().optional() }).optional())
        .query(async ({ ctx, input }) => {
            const items = await listPendingApprovals(
                ctx.auth.user.id,
                input?.executionId
            );

            return items.map(({ execution, ...item }) => ({
                ...item,
                workflow: execution.workflow,
            }));
        }),

    // APPROVE or REJECT, in the app: the request has to be the user's own
    decide: protectedProcedure
        .input(
            z.object({
                id: z.string(),
                decision: z.enum(["approve", "reject"]),
            })
        )
        .mutation(async ({ ctx, input }) => {
            const { outcome } = await decideApproval({
                id: input.id,
                decision: input.decision,
                via: "app",
                userId: ctx.auth.user.id,
            });

            if (outcome === "not_found") {
                throw new TRPCError({
                    code: "NOT_FOUND",
                    message: "Approval request not found.",
                });
            }

            if (outcome !== "answered") {
                throw new TRPCError({
                    code: "BAD_REQUEST",
                    message:
                        outcome === "expired"
                            ? "This approval request has expired."
                            : "This approval request was already answered.",
                });
            }

            return { id: input.id, decision: input.decision };
        }),
});
