import { resolveWorkspace } from "@/lib/workspaces";
import { hasRole, roleError } from "@/lib/workspace-roles";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { CredentialType } from "@prisma/client";
import { google } from "googleapis";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { getAppUrl } from "@/lib/app-url";
import { secretsMatch } from "@/lib/webhook-security";
import { PLAN_LIMITS } from "@/config/plans";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";
import { YOUTUBE_STATE_COOKIE, createYoutubeOAuthClient, type YoutubeCredential } from "@/lib/youtube-oauth";

const finish = (path: string) => {
    const response = NextResponse.redirect(`${getAppUrl()}${path}`);
    response.cookies.delete({ name: YOUTUBE_STATE_COOKIE, path: "/api/oauth/youtube" });
    return response;
};

// Google redirects here after the consent screen
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    let saved: { state?: string; name?: string; credentialId?: string; userId?: string } = {};
    try {
        saved = JSON.parse(request.cookies.get(YOUTUBE_STATE_COOKIE)?.value || "{}");
    } catch {
        // Treated as a missing state below
    }

    const back = saved.credentialId ? `/credentials/${encodeURIComponent(saved.credentialId)}` : "/credentials/new";
    const fail = (message: string) => finish(`${back}?oauthError=${encodeURIComponent(message)}`);

    const params = new URL(request.url).searchParams;

    if (params.get("error")) {
        return fail(
            params.get("error") === "access_denied"
                ? "YouTube sign-in was cancelled"
                : `Google returned an error: ${params.get("error")}`
        );
    }

    const code = params.get("code");
    if (
        !code ||
        !saved.state ||
        !secretsMatch(params.get("state") || "", saved.state) ||
        saved.userId !== session.user.id
    ) {
        return fail("The YouTube sign-in could not be verified. Please try again.");
    }

    try {
        const client = createYoutubeOAuthClient();
        const { tokens } = await client.getToken(code);

        if (!tokens.refresh_token) {
            return fail("Google did not return a refresh token. Remove this app under myaccount.google.com/permissions and try again.");
        }
        // Both permissions are needed; Google lets people untick them
        const granted = (tokens.scope ?? "").split(" ");
        if (!granted.some((scope) => scope.endsWith("/youtube.upload")) || !granted.some((scope) => scope.endsWith("/youtube.force-ssl"))) {
            return fail("Please allow both YouTube permissions (upload, and manage your videos and comments) on Google's screen.");
        }

        client.setCredentials(tokens);

        let email: string | undefined;
        if (tokens.id_token) {
            const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
            email = ticket.getPayload()?.email;
        }

        // The channel the account manages (a Brand Account is chosen on Google's screen)
        const channels = await google.youtube({ version: "v3", auth: client }).channels.list({ part: ["id", "snippet"], mine: true });
        const channel = channels.data.items?.[0];
        if (!channel?.id) {
            return fail("This Google account has no YouTube channel. Create one on youtube.com first, then connect again.");
        }

        const value: YoutubeCredential = {
            refreshToken: tokens.refresh_token,
            email,
            channelId: channel.id,
            channelTitle: channel.snippet?.title ?? "",
        };

        // Credentials belong to the workspace the user is working in, and
        // are its admins' to add or change
        const workspace = await resolveWorkspace(session.user);
        if (!hasRole(workspace.role, "ADMIN")) {
            return fail(roleError(workspace.role, "ADMIN"));
        }

        // Reconnect: the same credential gets the new sign-in
        if (saved.credentialId) {
            const existing = await prisma.credential.findFirst({
                where: { id: saved.credentialId, userId: workspace.ownerId, type: CredentialType.YOUTUBE },
                select: { id: true, name: true, type: true },
            });
            if (!existing) return fail("That YouTube credential was not found in this workspace.");

            await prisma.credential.update({ where: { id: existing.id }, data: { value: encrypt(JSON.stringify(value)) } });
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
                name: saved.name?.trim() || `YouTube (${value.channelTitle || email || "channel"})`,
                type: CredentialType.YOUTUBE,
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
        console.error("YouTube OAuth callback error:", error instanceof Error ? error.message : error);
        return fail(
            /youtube data api|has not been used|is disabled/i.test(error instanceof Error ? error.message : "")
                ? "The YouTube Data API v3 is not enabled in the Google Cloud project. Enable it, then connect again."
                : "YouTube sign-in failed. Please try again."
        );
    }
}
