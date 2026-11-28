import { randomBytes } from "crypto";
import { headers } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getAppUrl } from "@/lib/app-url";
import { LINKEDIN_STATE_COOKIE, createLinkedinAuthorizationUrl } from "@/lib/linkedin-oauth";

// Sends the signed-in user to LinkedIn's sign-in. The callback stores the
// result as a "LinkedIn account" credential, or, with ?credentialId=, renews
// that credential (LinkedIn sign-ins last 60 days).
export async function GET(request: NextRequest) {
    const session = await auth.api.getSession({ headers: await headers() });

    if (!session) {
        return NextResponse.redirect(`${getAppUrl()}/login`);
    }

    const query = new URL(request.url).searchParams;
    const name = (query.get("name") || "").slice(0, 100);
    const credentialId = (query.get("credentialId") || "").slice(0, 100);
    const state = randomBytes(24).toString("hex");
    const back = credentialId ? `/credentials/${encodeURIComponent(credentialId)}` : "/credentials/new";

    let url: string;
    try {
        url = createLinkedinAuthorizationUrl(state);
    } catch (error) {
        return NextResponse.redirect(
            `${getAppUrl()}${back}?oauthError=${encodeURIComponent(
                error instanceof Error ? error.message : "LinkedIn sign-in is not configured"
            )}`
        );
    }

    const response = NextResponse.redirect(url);

    // Checked in the callback so the code cannot be planted by another site
    response.cookies.set(
        LINKEDIN_STATE_COOKIE,
        JSON.stringify({ state, name, credentialId, userId: session.user.id }),
        {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "lax",
            path: "/api/oauth/linkedin",
            maxAge: 10 * 60,
        }
    );

    return response;
}
