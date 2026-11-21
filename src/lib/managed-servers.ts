import "server-only";

import type { Prisma } from "@prisma/client";
import prisma from "./db";
import type { Heartbeat, ManagedSubscription } from "./managed-server";

// The database side of the managed private server. The rules are in
// ./managed-server.ts (pure, tested).

/**
 * Keeps one row per Polar subscription of the managed server. Safe to run
 * for the same event twice: the row is found by the subscription id, and
 * only the status changes after it is created.
 */
export const saveManagedSubscription = async (subscription: ManagedSubscription) => {
    await prisma.managedServer.upsert({
        where: { polarSubscriptionId: subscription.subscriptionId },
        create: {
            polarSubscriptionId: subscription.subscriptionId,
            productId: subscription.productId,
            status: subscription.status,
            customerEmail: subscription.customerEmail,
        },
        update: { status: subscription.status },
    });
};

/**
 * Gives a user the servers bought with their address that no account has
 * yet. Only a verified address counts: anyone can sign up with someone
 * else's address, and the row leads to an install token.
 */
export const claimManagedServers = async (user: {
    id: string;
    email: string;
    emailVerified: boolean;
}) => {
    if (!user.emailVerified) return;

    await prisma.managedServer.updateMany({
        where: { userId: null, customerEmail: user.email.trim().toLowerCase() },
        data: { userId: user.id },
    });
};

/**
 * Saves what a server reported. "install-start" only checks the token. A
 * server that reports in but whose "installed" call was lost still counts
 * as installed from its first heartbeat.
 */
export const recordHeartbeat = async (
    server: { id: string; installedAt: Date | null },
    heartbeat: Heartbeat
) => {
    if (heartbeat.event === "install-start") return;

    const now = new Date();
    const health: Prisma.InputJsonValue = {
        containers: heartbeat.containers ?? [],
        ...(heartbeat.diskUsedPercent === undefined
            ? {}
            : { diskUsedPercent: heartbeat.diskUsedPercent }),
    };

    await prisma.managedServer.update({
        where: { id: server.id },
        data: {
            lastSeenAt: now,
            ...(heartbeat.event === "installed" || !server.installedAt ? { installedAt: now } : {}),
            ...(heartbeat.domain ? { domain: heartbeat.domain.toLowerCase() } : {}),
            ...(heartbeat.version ? { version: heartbeat.version } : {}),
            ...(heartbeat.lastBackupAt ? { lastBackupAt: new Date(heartbeat.lastBackupAt) } : {}),
            health,
        },
    });
};
