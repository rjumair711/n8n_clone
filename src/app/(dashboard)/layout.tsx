import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import { ManagedServerWelcomeGate } from "@/features/managed-servers/components/managed-server-welcome-gate";
import {
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar";
import prisma from "@/lib/db";
import { getRequestSession } from "@/lib/request-session";
import { perf } from "@/lib/perf";

const Layout = async ({
    children,
}: {
    children: React.ReactNode;
}) => {
    // The page reads the same cached session: one lookup per request
    const session = await getRequestSession();

    if (!session) {
        redirect("/login");
    }

    const user =
        await perf("layout user", () => prisma.user.findUniqueOrThrow({
            where: {
                id: session.user.id,
            },
            select: { id: true, hasCompletedOnboarding: true },
        }));

    // Workflows only need counting until onboarding is done
    if (!user.hasCompletedOnboarding) {
        const workflowCount =
            await perf("layout workflowCount", () => prisma.workflow.count({
                where: {
                    userId: session.user.id,
                },
            }));

        if (workflowCount > 0) {
            await prisma.user.update({
                where: {
                    id: user.id,
                },

                data: {
                    hasCompletedOnboarding: true,
                },
            });
        }
    }

    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="bg-accent/20">
                {children}
            </SidebarInset>
            {/* After paying for a managed server: how to connect it */}
            <ManagedServerWelcomeGate />
        </SidebarProvider>
    );
};

export default Layout;