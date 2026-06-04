import { redirect } from "next/navigation";
import { AppSidebar } from "@/components/app-sidebar";
import {
    SidebarInset,
    SidebarProvider,
} from "@/components/ui/sidebar";
import prisma from "@/lib/db";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

const Layout = async ({
    children,
}: {
    children: React.ReactNode;
}) => {

    console.log("👉 DASHBOARD LAYOUT IS RUNNING ON PATHNAME!");
    
    const session =
        await auth.api.getSession({
            headers: await headers(),
        });
        
    if (!session) {
        redirect("/login");
    }

    const user =
        await prisma.user.findUniqueOrThrow({
            where: {
                id: session.user.id,
            },
        });

    const workflowCount =
        await prisma.workflow.count({
            where: {
                userId: session.user.id,
            },
        });

    if (
        workflowCount > 0 &&
        !user.hasCompletedOnboarding
    ) {
        await prisma.user.update({
            where: {
                id: user.id,
            },

            data: {
                hasCompletedOnboarding: true,
            },
        });
    }



    return (
        <SidebarProvider>
            <AppSidebar />
            <SidebarInset className="bg-accent/20">
                {children}
            </SidebarInset>
        </SidebarProvider>
    );
};

export default Layout;