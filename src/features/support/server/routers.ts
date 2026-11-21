import { TRPCError } from "@trpc/server";
import { Resend } from "resend";
import { SELF_HOSTED } from "@/config/self-hosted";
import { getAdminEmails } from "@/lib/admin";
import { getAppUrl } from "@/lib/app-url";
import prisma from "@/lib/db";
import {
    SUPPORT_MESSAGES_PER_HOUR,
    buildNewSupportEmail,
    cleanSupportPage,
    getSupportEmail,
    supportMessageSchema,
} from "@/lib/support";
import { createTRPCRouter, protectedProcedure, viewerProcedure } from "@/trpc/init";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Tells the owner about a new message: to the support address, or to the
 * admins when there is none. Never throws: the message is saved either way
 * and shows in the admin dashboard.
 */
const notifyOwner = async (email: ReturnType<typeof buildNewSupportEmail>) => {
    const to = getSupportEmail() ?? getAdminEmails()[0];
    if (!to || !process.env.RESEND_API_KEY) return;

    try {
        const { error } = await new Resend(process.env.RESEND_API_KEY).emails.send({
            from: process.env.EMAIL_FROM || "RXJ <onboarding@resend.dev>",
            to,
            replyTo: email.replyTo,
            subject: email.subject,
            text: email.text,
            html: email.html,
        });
        if (error) console.error("Support email was not sent:", error.message);
    } catch (error) {
        console.error("Support email error:", error instanceof Error ? error.message : error);
    }
};

export const supportRouter = createTRPCRouter({
    // What the Support page and the popup show before anything is sent
    info: protectedProcedure.query(({ ctx }) => ({
        supportEmail: getSupportEmail(undefined, SELF_HOSTED),
        name: ctx.auth.user.name,
        email: ctx.auth.user.email,
    })),

    // In the workspace the customer works in, so a workflow of a shared
    // workspace can be attached too
    send: viewerProcedure.input(supportMessageSchema).mutation(async ({ ctx, input }) => {
        const userId = ctx.auth.user.id;

        const recent = await prisma.supportMessage.count({
            where: { userId, createdAt: { gt: new Date(Date.now() - HOUR_MS) } },
        });
        if (recent >= SUPPORT_MESSAGES_PER_HOUR) {
            throw new TRPCError({
                code: "TOO_MANY_REQUESTS",
                message: `You can send ${SUPPORT_MESSAGES_PER_HOUR} messages an hour. Try again later, or email us.`,
            });
        }

        // Only a workflow of the workspace the customer is in is attached,
        // by its current name
        const workflow = input.workflowId
            ? await prisma.workflow.findFirst({
                  where: { id: input.workflowId, userId: ctx.workspace.ownerId },
                  select: { id: true, name: true },
              })
            : null;

        const saved = await prisma.supportMessage.create({
            data: {
                userId,
                name: input.name,
                email: input.email,
                title: input.title,
                message: input.message,
                workflowId: workflow?.id ?? null,
                workflowName: workflow?.name ?? null,
                nodeId: workflow ? input.nodeId ?? null : null,
                nodeName: workflow ? input.nodeName ?? null : null,
                nodeType: workflow ? input.nodeType ?? null : null,
                page: cleanSupportPage(input.page) ?? null,
            },
            select: { id: true, email: true },
        });

        // Not awaited: sending must not slow down or fail the message
        void notifyOwner(
            buildNewSupportEmail({
                appUrl: getAppUrl(),
                messageId: saved.id,
                title: input.title,
                message: input.message,
                name: input.name,
                email: input.email,
                workflowName: workflow?.name,
                nodeName: workflow ? input.nodeName : null,
                nodeType: workflow ? input.nodeType : null,
            })
        );

        return { id: saved.id, email: saved.email };
    }),

    // My messages: the customer's own, newest first, with the replies
    mine: protectedProcedure.query(async ({ ctx }) =>
        prisma.supportMessage.findMany({
            where: { userId: ctx.auth.user.id },
            orderBy: { createdAt: "desc" },
            take: 50,
            select: {
                id: true,
                title: true,
                message: true,
                workflowName: true,
                nodeName: true,
                status: true,
                createdAt: true,
                replies: {
                    orderBy: { createdAt: "asc" },
                    select: { id: true, text: true, createdAt: true },
                },
            },
        })
    ),
});
