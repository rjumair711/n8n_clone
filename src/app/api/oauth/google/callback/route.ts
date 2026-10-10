import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { CredentialType } from "@prisma/client";
import { auth } from "@/lib/auth";
import prisma from "@/lib/db";
import { encrypt } from "@/lib/encryption";
import { secretsMatch } from "@/lib/webhook-security";
import { PLAN_LIMITS } from "@/config/plans";
import { describeAuditTarget } from "@/lib/audit-actions";
import { recordAudit } from "@/lib/audit-log";
import {
    GOOGLE_OAUTH_STATE_COOKIE,
    createGoogleOAuthClient,
    getAppUrl,
    type GoogleOAuthCredential,
} from "@/lib/google-oauth";

const finish = (path: string) => {
    const response = NextResponse.redirect(`${getAppUrl()}${path}`);
    response.cookies.delete({
        name: GOOGLE_OAUTH_STATE_COOKIE,
        path: "/api/oauth/google",
    });
    return response;
};

const fail = (message: string) =>
    finish(`/credentials/new?oauthError=${encodeURIComponent(message)}`);

// Google redirects here after the consent screen
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    const params = new URL(request.url).searchParams;

    if (params.get("error")) {
        return fail(
            params.get("error") === "access_denied"
                ? "Google sign-in was cancelled"
                : `Google returned an error: ${params.get("error")}`
        );
    }

    let saved: { state?: string; name?: string; userId?: string } = {};
    try {
        saved = JSON.parse(
            request.cookies.get(GOOGLE_OAUTH_STATE_COOKIE)?.value || "{}"
        );
    } catch {
        // Treated as a missing state below
    }

    const state = params.get("state") || "";
    const code = params.get("code");

    if (
        !code ||
        !saved.state ||
        !secretsMatch(state, saved.state) ||
        saved.userId !== session.user.id
    ) {
        return fail("The Google sign-in could not be verified. Please try again.");
    }

    try {
        const client = createGoogleOAuthClient();
        const { tokens } = await client.getToken(code);

        if (!tokens.refresh_token) {
            return fail(
                "Google did not return a refresh token. Remove this app under myaccount.google.com/permissions and try again."
            );
        }

        let email: string | undefined;
        if (tokens.id_token) {
            const ticket = await client.verifyIdToken({
                idToken: tokens.id_token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            email = ticket.getPayload()?.email;
        }

        const user = await prisma.user.findUniqueOrThrow({
            where: { id: session.user.id },
        });

        const credentialCount = await prisma.credential.count({
            where: { userId: user.id },
        });

        const credentialLimit = PLAN_LIMITS[user.plan].credentials;

        if (credentialCount >= credentialLimit) {
            return fail(
                `Credential limit reached. Your current plan allows up to ${credentialLimit} credentials.`
            );
        }

        const value: GoogleOAuthCredential = {
            refreshToken: tokens.refresh_token,
            email,
            scope: tokens.scope ?? undefined,
        };

        const created = await prisma.credential.create({
            data: {
                name:
                    saved.name?.trim() ||
                    (email ? `Google (${email})` : "Google account"),
                type: CredentialType.GOOGLE_OAUTH2,
                value: encrypt(JSON.stringify(value)),
                userId: user.id,
            },
            select: { id: true, name: true, type: true },
        });

        await recordAudit({
            userId: user.id,
            action: "credential.created",
            target: describeAuditTarget(`${created.type} credential`, created),
        });

        return finish("/credentials");
    } catch (error) {
        console.error("Google OAuth callback error:", error);

        return fail("Google sign-in failed. Please try again.");
    }
}
