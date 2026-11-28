import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { YOUTUBE_SCOPES, YOUTUBE_STATE_COOKIE, createYoutubeOAuthClient } from "@/lib/youtube-oauth";

// Sends the signed-in user to Google's consent screen for YouTube. The
// callback stores a "YouTube channel" credential, or, with ?credentialId=,
// renews that credential (after access was removed in the Google account).
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    const query = new URL(request.url).searchParams;
    const name = (query.get("name") || "").slice(0, 100);
    const credentialId = (query.get("credentialId") || "").slice(0, 100);
    const back = credentialId ? `/credentials/${encodeURIComponent(credentialId)}` : "/credentials/new";

    let client: ReturnType<typeof createYoutubeOAuthClient>;
    try {
        client = createYoutubeOAuthClient();
    } catch (error) {
        return NextResponse.redirect(
            `${getAppUrl()}${back}?oauthError=${encodeURIComponent(
                error instanceof Error ? error.message : "YouTube sign-in is not configured"
            )}`
        );
    }

    const state = randomBytes(24).toString("hex");

    const response = NextResponse.redirect(
        client.generateAuthUrl({
            // "offline" + "consent" make Google return a refresh token every time
            access_type: "offline",
            prompt: "consent select_account",
            scope: YOUTUBE_SCOPES,
            state,
        })
    );

    // Checked in the callback so the code cannot be planted by another site
    response.cookies.set(
        YOUTUBE_STATE_COOKIE,
        JSON.stringify({ state, name, credentialId, userId: session.user.id }),
        {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/api/oauth/youtube",
            maxAge: 10 * 60,
        }
    );

    return response;
}
