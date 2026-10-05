import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import {
    SALESFORCE_STATE_COOKIE,
    createSalesforceAuthorization,
    type SalesforceEnvironment,
} from "@/lib/salesforce-oauth";

// Sends the signed-in user to Salesforce's login. The callback route stores
// the result as a "Salesforce account" credential.
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    const query = new URL(request.url).searchParams;
    const environment: SalesforceEnvironment =
        query.get("environment") === "sandbox" ? "sandbox" : "production";
    const name = (query.get("name") || "").slice(0, 100);
    const state = randomBytes(24).toString("hex");

    let authorization: ReturnType<typeof createSalesforceAuthorization>;
    try {
        authorization = createSalesforceAuthorization(environment, state);
    } catch (error) {
        return NextResponse.redirect(
            `${getAppUrl()}/credentials/new?oauthError=${encodeURIComponent(
                error instanceof Error ? error.message : "Salesforce sign-in is not configured"
            )}`
        );
    }

    const response = NextResponse.redirect(authorization.url);

    // Checked in the callback so the code cannot be planted by another site;
    // the verifier proves the callback belongs to this sign-in (PKCE)
    response.cookies.set(
        SALESFORCE_STATE_COOKIE,
        JSON.stringify({
            state,
            name,
            environment,
            codeVerifier: authorization.codeVerifier,
            userId: session.user.id,
        }),
        {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/api/oauth/salesforce",
            maxAge: 10 * 60,
        }
    );

    return response;
}
