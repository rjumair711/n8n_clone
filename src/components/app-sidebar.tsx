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

import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarHeader, SidebarMenu, SidebarMenuButton, SidebarMenuItem } from "./ui/sidebar"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { UsageCard } from "@/components/subscription/usage-card";
import { getTrialDaysLeft } from "@/lib/subscription/get-trial-days-left";
import { useCurrentPlan } from "@/features/subscription/hook/use-current-plan"

// Cleaned up main items (Removed duplicate Billing link)
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

    const isFreePlan = !data?.plan || data.plan === "FREE";

    const trialDaysLeft = getTrialDaysLeft(data?.trialEndsAt ?? null);

    // Forces a global cache wipe if returning from Polar checkout or portal
    // Replace your existing useEffect with this one:
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);

        if (params.has("redirect") || params.has("customer_session_token") || params.has("session_id")) {
            // 💡 500ms buffer ensures the webhook settles in your DB before the client refetches
            const timer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ["current-plan"] });
                queryClient.invalidateQueries({ queryKey: ["subscription"] });
            }, 500);

            // Clean up the URL address bar seamlessly
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

                {/* 1. Only show Trial status if they are actually on the Free plan */}
                {isFreePlan && (
                    <div className="px-4 py-4"> {/* Increased vertical padding */}
                        <div className="rounded-xl border bg-card p-4 shadow-sm"> {/* Added background and padding */}
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

                <div className="px-3 pt-3">
                    <UsageCard
                        plan={data?.plan ?? "FREE"}
                        workflowsUsed={data?.workflowCount ?? 0}
                        executionsUsed={data?.executionsUsed ?? 0}
                    />
                </div>
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
                    {/* 2. DYNAMIC FOOTER: Show Upgrade if FREE, show Portal if SUBSCRIBED */}
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