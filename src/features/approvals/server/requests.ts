import prisma from "@/lib/db";
import { inngest } from "@/inngest/client";
import {
    APPROVAL_DECIDED_EVENT,
    APPROVAL_STATUS,
    type ApprovalDecision,
} from "@/lib/approvals";

// "answered": this call answered the request. The others say why it did not.
export type DecideOutcome =
    | "answered"
    | "already_answered"
    | "expired"
    | "not_found";

/**
 * Answers an approval request, once. The update only matches a request
 * that is still pending and not past its time, so two people pressing
 * Approve and Reject at the same moment cannot both win, and a link that
 * was used does nothing the second time.
 *
 * With `userId` the request must belong to that user (the in-app buttons);
 * a signed link needs no user.
 */
export const decideApproval = async ({
    id,
    decision,
    via,
    userId,
}: {
    id: string;
    decision: ApprovalDecision;
    via: "link" | "app";
    userId?: string;
}): Promise<{ outcome: DecideOutcome; status?: string }> => {
    const now = new Date();
    const owner = userId ? { userId } : {};

    const updated = await prisma.approvalRequest.updateMany({
        where: {
            id,
            ...owner,
            status: APPROVAL_STATUS.PENDING,
            expiresAt: { gt: now },
        },
        data: {
            status:
                decision === "approve"
                    ? APPROVAL_STATUS.APPROVED
                    : APPROVAL_STATUS.REJECTED,
            decidedAt: now,
            decidedVia: via,
        },
    });

    const request = await prisma.approvalRequest.findFirst({
        where: { id, ...owner },
        select: { status: true, executionId: true },
    });

    // Someone else's request is "not found", like one that is missing
    if (!request) return { outcome: "not_found" };

    if (updated.count === 0) {
        return {
            outcome:
                request.status === APPROVAL_STATUS.PENDING
                    ? "expired"
                    : request.status === APPROVAL_STATUS.EXPIRED
                        ? "expired"
                        : "already_answered",
            status: request.status,
        };
    }

    // Wakes the waiting run. Should the event be lost, the run reads the
    // answer from the database when its wait times out.
    await inngest.send({
        name: APPROVAL_DECIDED_EVENT,
        data: {
            approvalId: id,
            executionId: request.executionId,
            decision,
        },
    });

    return { outcome: "answered", status: request.status };
};

/**
 * The requests a user can still answer, newest first.
 */
export const listPendingApprovals = async (
    userId: string,
    executionId?: string
) =>
    prisma.approvalRequest.findMany({
        where: {
            userId,
            status: APPROVAL_STATUS.PENDING,
            expiresAt: { gt: new Date() },
            ...(executionId ? { executionId } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: {
            id: true,
            kind: true,
            title: true,
            details: true,
            channel: true,
            expiresAt: true,
            createdAt: true,
            executionId: true,
            execution: {
                select: { workflow: { select: { id: true, name: true } } },
            },
        },
    });
