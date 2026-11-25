import { createTRPCRouter, editorProcedure, viewerProcedure } from "@/trpc/init";
import { TRPCError } from "@trpc/server";
import z from "zod";
import { MAX_APPROVAL_FIELD_CHARS, MAX_APPROVAL_FIELDS } from "@/lib/approvals";
import { ApprovalEditError, decideApproval, listPendingApprovals } from "./requests";

export const approvalsRouter = createTRPCRouter({
    // The requests the user can still answer; with an execution id, only
    // that execution's
    getPending: viewerProcedure
        .input(z.object({ executionId: z.string().optional() }).optional())
        .query(async ({ ctx, input }) => {
            const items = await listPendingApprovals(
                ctx.workspace.ownerId,
                input?.executionId
            );

            return items.map(({ execution, ...item }) => ({
                ...item,
                workflow: execution.workflow,
            }));
        }),

    // APPROVE or REJECT, in the app: the request has to be the user's own
    decide: editorProcedure
        .input(
            z.object({
                id: z.string(),
                decision: z.enum(["approve", "reject"]),
                // Editable Fields the approver changed, by name
                edits: z
                    .record(z.string(), z.string().max(MAX_APPROVAL_FIELD_CHARS))
                    .refine((value) => Object.keys(value).length <= MAX_APPROVAL_FIELDS)
                    .optional(),
            })
        )
        .mutation(async ({ ctx, input }) => {
            let outcome;
            try {
                ({ outcome } = await decideApproval({
                    id: input.id,
                    decision: input.decision,
                    via: "app",
                    userId: ctx.workspace.ownerId,
                    edits: input.edits,
                }));
            } catch (error) {
                if (error instanceof ApprovalEditError) {
                    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
                }
                throw error;
            }

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
