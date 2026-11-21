import { NextResponse } from "next/server";
import { SELF_HOSTED } from "@/config/self-hosted";
import { getRequestIp } from "@/lib/audit-actions";
import prisma from "@/lib/db";
import {
    hashInstallToken,
    heartbeatSchema,
    isSubscriptionLive,
    readInstallToken,
} from "@/lib/managed-server";
import { recordHeartbeat } from "@/lib/managed-servers";
import { rateLimitResponse } from "@/lib/rate-limit";

// A heartbeat is a few hundred bytes; anything far bigger is not one
const MAX_BODY_BYTES = 16 * 1024;
// The agent sends one every 15 minutes, plus a few while it installs
const HEARTBEAT_RATE_LIMIT = 20;

const error = (status: number, message: string) =>
    NextResponse.json({ ok: false, error: message }, { status });

/**
 * A customer's managed server reports in (self-host/rxj-agent.sh and
 * public/install.sh), with `Authorization: Bearer <install token>`. It says
 * whether the subscription is still paid and whether updates are paused.
 */
export async function POST(request: Request) {
    // Only the hosted app looks after servers
    if (SELF_HOSTED) return error(404, "Not found");

    const token = readInstallToken(request.headers.get("authorization"));
    if (!token) return error(401, "Missing or malformed install token.");

    const server = await prisma.managedServer.findUnique({
        where: { tokenHash: hashInstallToken(token) },
        select: { id: true, status: true, installedAt: true },
    });
    if (!server) {
        return error(401, "This install token is not valid. Make a new install command in Settings → Private server.");
    }

    // Per server. Only tokens that exist are counted, so made-up tokens
    // cannot fill the rate limit table.
    const limited = await rateLimitResponse(`managed-server:${server.id}`, HEARTBEAT_RATE_LIMIT);
    if (limited) return limited;

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return error(413, "Heartbeat too large.");

    let body: unknown;
    try {
        body = JSON.parse(raw);
    } catch {
        return error(400, "The heartbeat is not JSON.");
    }

    const parsed = heartbeatSchema.safeParse(body);
    if (!parsed.success) return error(400, "The heartbeat has fields RXJ does not understand.");

    await recordHeartbeat(server, parsed.data);

    return NextResponse.json({
        ok: true,
        subscriptionActive: isSubscriptionLive(server.status),
        // A switch for the platform's owner: set MANAGED_SERVER_UPDATES_PAUSED
        // to true to stop every server's weekly update (a bad release)
        updatesPaused: process.env.MANAGED_SERVER_UPDATES_PAUSED === "true",
        // The address the server called from, so the installer can check
        // that the domain's DNS points at it
        ip: getRequestIp(request.headers),
    });
}
