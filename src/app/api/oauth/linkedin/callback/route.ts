import { resolveWorkspace } from "@/lib/workspaces";
import { hasRole, roleError } from "@/lib/workspace-roles";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { CredentialType } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { getAppUrl } from "@/lib/app-url";
import { secretsMatch } from "@/lib/webhook-security";
import { PLAN_LIMITS } from "@/config/plans";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";
import { LINKEDIN_STATE_COOKIE, exchangeLinkedinCode } from "@/lib/linkedin-oauth";

const finish = (path: string) => {
    const response = NextResponse.redirect(`${getAppUrl()}${path}`);
    response.cookies.delete({ name: LINKEDIN_STATE_COOKIE, path: "/api/oauth/linkedin" });
    return response;
};

// LinkedIn redirects here after the sign-in
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    let saved: { state?: string; name?: string; credentialId?: string; userId?: string } = {};
    try {
        saved = JSON.parse(request.cookies.get(LINKEDIN_STATE_COOKIE)?.value || "{}");
    } catch {
        // Treated as a missing state below
    }

    const back = saved.credentialId ? `/credentials/${encodeURIComponent(saved.credentialId)}` : "/credentials/new";
    const fail = (message: string) => finish(`${back}?oauthError=${encodeURIComponent(message)}`);

    const params = new URL(request.url).searchParams;

    if (params.get("error")) {
        const error = params.get("error");
        return fail(
            error === "user_cancelled_login" || error === "user_cancelled_authorize"
                ? "LinkedIn sign-in was cancelled"
                : error === "unauthorized_scope_error"
                    ? "The LinkedIn app is missing a product: add \"Sign In with LinkedIn using OpenID Connect\" and \"Share on LinkedIn\" (and, with LINKEDIN_ORGANIZATION_POSTS, the Community Management API)."
                    : `LinkedIn returned an error: ${params.get("error_description") || error}`
        );
    }

    const code = params.get("code");

    if (
        !code ||
        !saved.state ||
        !secretsMatch(params.get("state") || "", saved.state) ||
        saved.userId !== session.user.id
    ) {
        return fail("The LinkedIn sign-in could not be verified. Please try again.");
    }

    try {
        const value = await exchangeLinkedinCode(code);

        // Credentials belong to the workspace the user is working in, and
        // are its admins' to add or change
        const workspace = await resolveWorkspace(session.user);

        if (!hasRole(workspace.role, "ADMIN")) {
            return fail(roleError(workspace.role, "ADMIN"));
        }

        // Reconnect: the same credential gets the new sign-in, so every
        // workflow that uses it keeps working
        if (saved.credentialId) {
            const existing = await prisma.credential.findFirst({
                where: { id: saved.credentialId, userId: workspace.ownerId, type: CredentialType.LINKEDIN },
                select: { id: true, name: true, type: true },
            });
            if (!existing) return fail("That LinkedIn credential was not found in this workspace.");

            await prisma.credential.update({
                where: { id: existing.id },
                data: { value: encrypt(JSON.stringify(value)) },
            });
            await recordAudit({
                userId: workspace.ownerId,
                actor: workspace.actor,
                action: "credential.updated",
                target: `${describeAuditTarget(`${existing.type} credential`, existing)}, reconnected`,
            });

            return finish("/credentials");
        }

        const user = await prisma.user.findUniqueOrThrow({ where: { id: workspace.ownerId } });
        const credentialCount = await prisma.credential.count({ where: { userId: user.id } });
        const credentialLimit = PLAN_LIMITS[user.plan].credentials;

        if (credentialCount >= credentialLimit) {
            return fail(`Credential limit reached. Your current plan allows up to ${credentialLimit} credentials.`);
        }

        const created = await prisma.credential.create({
            data: {
                name: saved.name?.trim() || `LinkedIn (${value.name || "account"})`,
                type: CredentialType.LINKEDIN,
                value: encrypt(JSON.stringify(value)),
                userId: user.id,
                workspaceId: workspace.id,
            },
            select: { id: true, name: true, type: true },
        });

        await recordAudit({
            userId: user.id,
            actor: workspace.actor,
            action: "credential.created",
            target: describeAuditTarget(`${created.type} credential`, created),
        });

        return finish("/credentials");
    } catch (error) {
        console.error("LinkedIn OAuth callback error:", error instanceof Error ? error.message : error);

        return fail(
            `LinkedIn sign-in failed${error instanceof Error ? `: ${error.message}` : ""}. Please try again.`
        );
    }
}
