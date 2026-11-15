import type { Prisma } from "@prisma/client";
import prisma from "@/lib/db";
import { createTRPCRouter, protectedProcedure } from "@/trpc/init";
import { buildChecklist, readOnboardingState } from "../lib/checklist";

// The signed-in person's own account: its credentials, runs and workflows
export const onboardingRouter = createTRPCRouter({
    getChecklist: protectedProcedure.query(async ({ ctx }) => {
        const userId = ctx.auth.user.id;
        // Whether there is one is enough; counting every execution is not
        const [user, credentials, anyExecution, activeWorkflows] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId }, select: { onboarding: true } }),
            prisma.credential.count({ where: { userId } }),
            prisma.execution.findFirst({ where: { workflow: { userId } }, select: { id: true } }),
            prisma.workflow.count({ where: { userId, active: true } }),
        ]);

        return buildChecklist(
            { credentials, executions: anyExecution ? 1 : 0, activeWorkflows },
            readOnboardingState(user?.onboarding),
        );
    }),

    dismiss: protectedProcedure.mutation(async ({ ctx }) => {
        await markOnboarding(ctx.auth.user.id, { dismissed: true });
        return { dismissed: true };
    }),
});

/** Records a step that cannot be read from other data (used a template). */
export const markOnboarding = async (
    userId: string,
    patch: { usedTemplate?: true; dismissed?: true },
) => {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { onboarding: true } });
    const next = { ...readOnboardingState(user?.onboarding), ...patch };
    await prisma.user.update({
        where: { id: userId },
        data: { onboarding: next as Prisma.InputJsonValue },
    });
};
