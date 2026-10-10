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
import {
    SALESFORCE_STATE_COOKIE,
    exchangeSalesforceCode,
    type SalesforceCredential,
    type SalesforceEnvironment,
} from "@/lib/salesforce-oauth";

const finish = (path: string) => {
    const response = NextResponse.redirect(`${getAppUrl()}${path}`);
    response.cookies.delete({
        name: SALESFORCE_STATE_COOKIE,
        path: "/api/oauth/salesforce",
    });
    return response;
};

const fail = (message: string) =>
    finish(`/credentials/new?oauthError=${encodeURIComponent(message)}`);

// Salesforce redirects here after the login
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    const params = new URL(request.url).searchParams;

    if (params.get("error")) {
        return fail(
            params.get("error") === "access_denied"
                ? "Salesforce sign-in was cancelled"
                : `Salesforce returned an error: ${params.get("error_description") || params.get("error")}`
        );
    }

    let saved: {
        state?: string;
        name?: string;
        environment?: SalesforceEnvironment;
        codeVerifier?: string;
        userId?: string;
    } = {};
    try {
        saved = JSON.parse(
            request.cookies.get(SALESFORCE_STATE_COOKIE)?.value || "{}"
        );
    } catch {
        // Treated as a missing state below
    }

    const code = params.get("code");

    if (
        !code ||
        !saved.state ||
        !saved.codeVerifier ||
        !secretsMatch(params.get("state") || "", saved.state) ||
        saved.userId !== session.user.id
    ) {
        return fail("The Salesforce sign-in could not be verified. Please try again.");
    }

    const environment: SalesforceEnvironment =
        saved.environment === "sandbox" ? "sandbox" : "production";

    try {
        const token = await exchangeSalesforceCode(
            environment,
            code,
            saved.codeVerifier
        );

        if (!token.refreshToken) {
            return fail(
                "Salesforce did not return a refresh token. Add the 'Perform requests at any time (refresh_token, offline_access)' scope to the connected app."
            );
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

        const value: SalesforceCredential = {
            refreshToken: token.refreshToken,
            instanceUrl: token.instanceUrl,
            environment,
        };

        const created = await prisma.credential.create({
            data: {
                name:
                    saved.name?.trim() ||
                    `Salesforce (${new URL(token.instanceUrl).hostname.split(".")[0]})`,
                type: CredentialType.SALESFORCE,
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
        console.error("Salesforce OAuth callback error:", error);

        return fail(
            `Salesforce sign-in failed${error instanceof Error ? `: ${error.message}` : ""}. Please try again.`
        );
    }
}
