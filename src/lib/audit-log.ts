import "server-only";

import { headers } from "next/headers";
import { type AuditAction, getRequestIp } from "./audit-actions";
import prisma from "./db";

type AuditEntry = {
    userId: string;
    action: AuditAction;
    // From describeAuditTarget: a name and an id, never a secret
    target?: string | null;
    // Read from the current request when left out
    ipAddress?: string | null;
};

const requestIp = async () => {
    try {
        return getRequestIp(await headers());
    } catch {
        // Not inside a request (a script, a background job)
        return null;
    }
};

/**
 * Adds one line to the audit log. Called after the action it records has
 * succeeded.
 *
 * Never throws: an action that worked must not be reported as failed
 * because the line about it could not be written. A failure is logged on
 * the server instead.
 */
export const recordAudit = async ({
    userId,
    action,
    target,
    ipAddress,
}: AuditEntry): Promise<void> => {
    try {
        await prisma.auditLog.create({
            data: {
                userId,
                action,
                target: target || null,
                ipAddress: ipAddress === undefined ? await requestIp() : ipAddress,
            },
        });
    } catch (error) {
        console.error(`Audit log: could not record ${action}:`, error);
    }
};
