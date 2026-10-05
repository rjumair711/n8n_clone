import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import {
    GOOGLE_OAUTH_SCOPES,
    GOOGLE_OAUTH_STATE_COOKIE,
    createGoogleOAuthClient,
    getAppUrl,
} from "@/lib/google-oauth";

// Sends the signed-in user to Google's consent screen. The callback route
// stores the result as a "Google account" credential.
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    let client: ReturnType<typeof createGoogleOAuthClient>;
    try {
        client = createGoogleOAuthClient();
    } catch (error) {
        return NextResponse.redirect(
            `${getAppUrl()}/credentials/new?oauthError=${encodeURIComponent(
                error instanceof Error ? error.message : "Google OAuth is not configured"
            )}`
        );
    }

    const state = randomBytes(24).toString("hex");
    const name = (new URL(request.url).searchParams.get("name") || "").slice(0, 100);

    const response = NextResponse.redirect(
        client.generateAuthUrl({
            // "offline" + "consent" make Google return a refresh token every time
            access_type: "offline",
            prompt: "consent",
            scope: GOOGLE_OAUTH_SCOPES,
            state,
        })
    );

    // Checked in the callback so the code cannot be planted by another site
    response.cookies.set(
        GOOGLE_OAUTH_STATE_COOKIE,
        JSON.stringify({ state, name, userId: session.user.id }),
        {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/api/oauth/google",
            maxAge: 10 * 60,
        }
    );

    return response;
}
