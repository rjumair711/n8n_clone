import type { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { rateLimitResponse } from "@/lib/rate-limit";
import {
    APPROVAL_STATUS,
    escapeHtml,
    formatApprovalDetails,
    isApprovalDecision,
    type ApprovalDecision,
} from "@/lib/approvals";
import { verifyApprovalLink } from "@/lib/approval-links";
import { decideApproval } from "@/features/approvals/server/requests";

// The Approve and Reject links of an approval request:
//   <app>/api/approvals/<id>?decision=approve&expires=...&signature=...
//
// GET only shows what is being asked, with a button. POST (that button)
// answers the request. A mail scanner or link preview that opens the link
// therefore approves nothing. No sign-in: the signed link is the permission.

const page = (title: string, body: string, status = 200) =>
    new Response(
        `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title><style>body{font-family:system-ui,Arial,sans-serif;background:#f9fafb;color:#111827;margin:0;padding:24px}main{max-width:560px;margin:40px auto;background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:24px}h1{font-size:18px;margin:0 0 12px}p{font-size:14px;line-height:1.5}pre{background:#f3f4f6;padding:12px;border-radius:6px;white-space:pre-wrap;word-break:break-word;font-size:12px}button{border:0;border-radius:6px;padding:10px 18px;color:#fff;font-weight:600;font-size:14px;cursor:pointer}.approve{background:#16a34a}.reject{background:#dc2626}.muted{color:#6b7280;font-size:12px}</style></head><body><main>${body}</main></body></html>`,
        {
            status,
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                // The link is a secret: it is not passed on or kept
                "Cache-Control": "private, no-store",
                "Referrer-Policy": "no-referrer",
                "X-Robots-Tag": "noindex",
            },
        }
    );

const message = (title: string, text: string, status = 200) =>
    page(title, `<h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p>`, status);

const STATUS_TEXT: Record<string, string> = {
    [APPROVAL_STATUS.APPROVED]: "This request was already approved.",
    [APPROVAL_STATUS.REJECTED]: "This request was already rejected.",
    [APPROVAL_STATUS.EXPIRED]: "This request has expired.",
    [APPROVAL_STATUS.CANCELLED]: "This request was cancelled.",
};

// Checks the link, then loads the request it is for
const readRequest = async (request: NextRequest, id: string) => {
    const url = new URL(request.url);
    const decision = url.searchParams.get("decision");

    const check = verifyApprovalLink(
        id,
        decision,
        url.searchParams.get("expires"),
        url.searchParams.get("signature")
    );

    // Needs no database, so a guessed link costs nothing
    if (check === "invalid" || !isApprovalDecision(decision)) {
        return {
            response: message("Link not valid", "This approval link is not valid.", 404),
        };
    }

    if (check === "expired") {
        return {
            response: message("Request expired", "This approval request has expired.", 410),
        };
    }

    const limited = await rateLimitResponse(`approval:${id}`);
    if (limited) return { response: limited };

    const approval = await prisma.approvalRequest.findUnique({
        where: { id },
        select: {
            id: true,
            kind: true,
            title: true,
            details: true,
            status: true,
            expiresAt: true,
            execution: { select: { workflow: { select: { name: true } } } },
        },
    });

    if (!approval) {
        return {
            response: message("Link not valid", "This approval link is not valid.", 404),
        };
    }

    return { approval, decision: decision as ApprovalDecision };
};

export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const found = await readRequest(request, id);
        if (found.response) return found.response;

        const { approval, decision } = found;

        if (approval.status !== APPROVAL_STATUS.PENDING) {
            return message(
                "Already answered",
                STATUS_TEXT[approval.status] ?? "This request can no longer be answered.",
                409
            );
        }

        if (approval.expiresAt.getTime() <= Date.now()) {
            return message("Request expired", "This approval request has expired.", 410);
        }

        const approve = decision === "approve";
        const heading =
            approval.kind === "tool"
                ? `An AI Agent wants to use the tool "${approval.title}"`
                : approval.title;
        const details = formatApprovalDetails(approval.details);

        return page(
            approve ? "Approve?" : "Reject?",
            [
                `<h1>${escapeHtml(heading)}</h1>`,
                `<p>Workflow: ${escapeHtml(approval.execution.workflow.name)}</p>`,
                details
                    ? `<p>${approval.kind === "tool" ? "Arguments" : "Details"}:</p><pre>${escapeHtml(details)}</pre>`
                    : "",
                // Posts back to this same signed link
                `<form method="post"><button type="submit" class="${approve ? "approve" : "reject"}">${approve ? "Approve" : "Reject"}</button></form>`,
                `<p class="muted">The request can be answered once and expires on ${escapeHtml(approval.expiresAt.toISOString())}.</p>`,
            ].join("")
        );
    } catch (error) {
        // Never the URL: it carries the signature
        console.error(
            "Approval link error:",
            error instanceof Error ? error.message : error
        );

        return message("Something went wrong", "The request could not be shown. Try again.", 500);
    }
}

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id } = await params;
        const found = await readRequest(request, id);
        if (found.response) return found.response;

        const { decision } = found;
        const { outcome, status } = await decideApproval({ id, decision, via: "link" });

        if (outcome === "answered") {
            return decision === "approve"
                ? message("Approved", "Thank you. The workflow continues.")
                : message("Rejected", "Thank you. The action will not be carried out.");
        }

        if (outcome === "expired") {
            return message("Request expired", "This approval request has expired.", 410);
        }

        return message(
            "Already answered",
            (status && STATUS_TEXT[status]) || "This request can no longer be answered.",
            409
        );
    } catch (error) {
        console.error(
            "Approval link error:",
            error instanceof Error ? error.message : error
        );

        return message("Something went wrong", "Your answer could not be saved. Try again.", 500);
    }
}
