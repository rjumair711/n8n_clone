"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
    CreditCardIcon,
    FolderOpenIcon,
    HistoryIcon,
    KeyIcon,
    LogOutIcon,
    SparklesIcon,
} from "lucide-react"

import { 
    Sidebar, 
    SidebarContent, 
    SidebarFooter, 
    SidebarGroup, 
    SidebarGroupContent, 
    SidebarHeader, 
    SidebarMenu, 
    SidebarMenuButton, 
    SidebarMenuItem,
    useSidebar 
} from "./ui/sidebar"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { UsageCard } from "@/components/subscription/usage-card";
import { getTrialDaysLeft } from "@/lib/subscription/get-trial-days-left";
import { useCurrentPlan } from "@/features/subscription/hook/use-current-plan"

const menuItems = [
    {
        title: "Main",
        items: [
            { id: "workflows", title: "Workflows", icon: FolderOpenIcon, url: "/workflows" },
            { id: "credentials", title: "Credentials", icon: KeyIcon, url: "/credentials" },
            { id: "executions", title: "Executions", icon: HistoryIcon, url: "/executions" },
        ],
    },
]

export const AppSidebar = () => {
    const router = useRouter()
    const pathname = usePathname()
    const queryClient = useQueryClient()
    const { data } = useCurrentPlan();
    const { state } = useSidebar();
    const isCollapsed = state === "collapsed";

    const isFreePlan = !data?.plan || data.plan === "FREE";
    const trialDaysLeft = getTrialDaysLeft(data?.trialEndsAt ?? null);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);

        if (params.has("redirect") || params.has("customer_session_token") || params.has("session_id")) {
            const timer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ["current-plan"] });
                queryClient.invalidateQueries({ queryKey: ["subscription"] });
            }, 500);

            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, "", cleanUrl);

            return () => clearTimeout(timer);
        }
    }, [queryClient]);

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader>
                <SidebarMenuItem>
                    <SidebarMenuButton asChild className="gap-x-4 h-10 px-4">
                        <Link href="/" prefetch>
                            <Image src="/logos/logo.svg" alt="Nodebase" width={30} height={30} />
                            <span className="font-semibold text-sm">Nodebase</span>
                        </Link>
                    </SidebarMenuButton>
                </SidebarMenuItem>
                {isFreePlan && !isCollapsed && (
                    <div className="px-4 py-4">
                        <div className="rounded-xl border bg-card p-4 shadow-sm">
                            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                Free Trial
                            </p>
                            <p className="mt-1 text-sm font-medium">
                                {data?.trialEndsAt
                                    ? (trialDaysLeft > 0 ? `${trialDaysLeft} days remaining` : "Trial expired")
                                    : "7 days remaining"
                                }
                            </p>
                        </div>
                    </div>
                )}

                {!isCollapsed && (
                    <div className="px-3 pt-3">
                        <UsageCard
                            plan={data?.plan ?? "FREE"}
                            workflowsUsed={data?.workflowCount ?? 0}
                            executionsUsed={data?.executionsUsed ?? 0}
                        />
                    </div>
                )}
            </SidebarHeader>

            <SidebarContent>
                {menuItems.map((group) => (
                    <SidebarGroup key={group.title}>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {group.items.map((item) => (
                                    <SidebarMenuItem key={item.title}>
                                        <SidebarMenuButton
                                            tooltip={item.title}
                                            isActive={pathname.startsWith(item.url)}
                                            asChild
                                            className="gap-x-4 h-10 px-4"
                                        >
                                            <Link href={item.url} prefetch>
                                                <item.icon className="size-4" />
                                                <span>{item.title}</span>
                                            </Link>
                                        </SidebarMenuButton>
                                    </SidebarMenuItem>
                                ))}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>
                ))}
            </SidebarContent>

            <SidebarFooter>
                <SidebarMenu>
                    {isFreePlan ? (
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                tooltip="Upgrade Plan"
                                className="gap-x-4 h-10 px-4 text-muted-foreground hover:text-foreground font-medium"
                                onClick={() => router.push("/billing")}
                            >
                                <SparklesIcon className="h-4 w-4" />
                                <span>Upgrade Plan</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    ) : (
                        <SidebarMenuItem>
                            <SidebarMenuButton
                                tooltip="Billing Portal"
                                className="gap-x-4 h-10 px-4 text-muted-foreground hover:text-foreground"
                                onClick={() => authClient.customer.portal()}
                            >
                                <CreditCardIcon className="h-4 w-4" />
                                <span>Billing Portal</span>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    )}

                    <SidebarMenuItem>
                        <SidebarMenuButton
                            tooltip="Sign out"
                            className="gap-x-4 h-10 px-4 text-muted-foreground hover:text-destructive"
                            onClick={() => {
                                authClient.signOut({
                                    fetchOptions: {
                                        onSuccess: () => router.push("/login")
                                    }
                                })
                            }}
                        >
                            <LogOutIcon className="h-4 w-4" />
                            <span>Sign out</span>
                        </SidebarMenuButton>
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}