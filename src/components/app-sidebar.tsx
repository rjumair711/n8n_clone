"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import {
    BookOpenIcon,
    BotIcon,
    ChevronsUpDownIcon,
    Code2Icon,
    CreditCardIcon,
    FolderOpenIcon,
    GaugeIcon,
    HistoryIcon,
    KeyIcon,
    LayoutTemplateIcon,
    LogOutIcon,
    SettingsIcon,
    UserCheckIcon,
    type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"

import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    useSidebar,
} from "./ui/sidebar"
import { Avatar, AvatarFallback, AvatarImage } from "./ui/avatar"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import { authClient } from "@/lib/auth-client"
import { getInitials } from "@/lib/initials"
import { RxjLogo } from "@/features/marketing/components/rxj-logo"
import { WorkspaceSwitcher } from "@/features/workspaces/components/workspace-switcher"

type NavItem = { title: string; icon: LucideIcon; url: string }

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
    {
        title: "Build",
        items: [
            { title: "Workflows", icon: FolderOpenIcon, url: "/workflows" },
            { title: "Templates", icon: LayoutTemplateIcon, url: "/templates" },
            { title: "Chatbots", icon: BotIcon, url: "/chatbots" },
        ],
    },
    {
        title: "Operate",
        items: [
            { title: "Executions", icon: HistoryIcon, url: "/executions" },
            { title: "Approvals", icon: UserCheckIcon, url: "/approvals" },
            { title: "Credentials", icon: KeyIcon, url: "/credentials" },
        ],
    },
]

// The account menu, in order; Sign out comes after them
const ACCOUNT_ITEMS: NavItem[] = [
    { title: "Settings", icon: SettingsIcon, url: "/settings" },
    { title: "Usage & plan", icon: GaugeIcon, url: "/settings/usage" },
    { title: "Billing", icon: CreditCardIcon, url: "/billing" },
    { title: "API Keys", icon: Code2Icon, url: "/settings/api-keys" },
    { title: "Docs", icon: BookOpenIcon, url: "/docs" },
]

// One size for every item: 36px high, 16px icons, the same gap and padding
const ITEM_CLASS =
    "h-9 gap-3 px-3 text-sm text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground data-[active=true]:bg-[var(--sidebar-active)] data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground [&>svg]:size-4 data-[active=true]:[&>svg]:text-blue-400"

const isActivePath = (pathname: string, url: string) =>
    pathname === url || pathname.startsWith(`${url}/`)

const AccountMenu = () => {
    const router = useRouter()
    const { isMobile, setOpenMobile } = useSidebar()
    const { data, isPending } = authClient.useSession()
    const user = data?.user
    const initials = getInitials(user?.name, user?.email)

    const signOut = () =>
        authClient.signOut({
            fetchOptions: { onSuccess: () => router.push("/login") },
        })

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <SidebarMenuButton
                    size="lg"
                    tooltip={user?.name || user?.email || "Account"}
                    className="gap-3 px-2 hover:bg-sidebar-accent data-[state=open]:bg-sidebar-accent"
                    aria-label="Account menu"
                >
                    <Avatar className="size-8 rounded-lg">
                        {user?.image && <AvatarImage src={user.image} alt="" />}
                        <AvatarFallback className="rounded-lg bg-[var(--sidebar-active)] text-xs font-medium text-sidebar-accent-foreground">
                            {isPending ? "" : initials}
                        </AvatarFallback>
                    </Avatar>
                    <div className="grid min-w-0 flex-1 text-left leading-tight">
                        <span className="truncate text-sm font-medium">
                            {isPending ? " " : user?.name || user?.email}
                        </span>
                        <span className="truncate text-xs text-[var(--sidebar-muted)]">
                            {isPending ? " " : user?.email}
                        </span>
                    </div>
                    <ChevronsUpDownIcon className="ml-auto size-4 text-[var(--sidebar-muted)]" />
                </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
                side={isMobile ? "top" : "right"}
                align="end"
                sideOffset={8}
                className="w-60"
            >
                <DropdownMenuLabel className="font-normal">
                    <p className="truncate text-sm font-medium">{user?.name || user?.email}</p>
                    <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                    {ACCOUNT_ITEMS.map((item) => (
                        <DropdownMenuItem key={item.url} asChild>
                            <Link href={item.url} onClick={() => setOpenMobile(false)}>
                                <item.icon className="size-4" />
                                {item.title}
                            </Link>
                        </DropdownMenuItem>
                    ))}
                </DropdownMenuGroup>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={signOut} variant="destructive">
                    <LogOutIcon className="size-4" />
                    Sign out
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

export const AppSidebar = () => {
    const pathname = usePathname()
    const queryClient = useQueryClient()
    const { state, setOpenMobile } = useSidebar()
    const isCollapsed = state === "collapsed"

    // Back from a checkout: the plan and usage are asked again
    useEffect(() => {
        const params = new URLSearchParams(window.location.search)

        if (params.has("redirect") || params.has("customer_session_token") || params.has("session_id")) {
            const timer = setTimeout(() => {
                queryClient.invalidateQueries({ queryKey: ["current-plan"] })
                queryClient.invalidateQueries({ queryKey: ["subscription"] })
            }, 500)

            const cleanUrl = window.location.pathname
            window.history.replaceState({}, "", cleanUrl)

            return () => clearTimeout(timer)
        }
    }, [queryClient])

    return (
        <Sidebar collapsible="icon">
            <SidebarHeader className="gap-3 px-3 pb-1 pt-4 group-data-[collapsible=icon]:px-2">
                <Link
                    href="/"
                    aria-label="RXJ home"
                    className="flex h-8 items-center px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
                >
                    <RxjLogo height={isCollapsed ? 11 : 20} />
                </Link>
                {!isCollapsed && <WorkspaceSwitcher />}
            </SidebarHeader>

            <SidebarContent className="gap-0">
                {NAV_GROUPS.map((group) => (
                    <SidebarGroup key={group.title} className="px-3 py-2 group-data-[collapsible=icon]:px-2">
                        <SidebarGroupLabel className="h-7 px-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--sidebar-muted)]">
                            {group.title}
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu className="gap-0.5">
                                {group.items.map((item) => (
                                    <SidebarMenuItem key={item.url}>
                                        <SidebarMenuButton
                                            asChild
                                            tooltip={item.title}
                                            isActive={isActivePath(pathname, item.url)}
                                            className={ITEM_CLASS}
                                        >
                                            {/* Default prefetch: the page's shell, not its data */}
                                            <Link href={item.url} onClick={() => setOpenMobile(false)}>
                                                <item.icon />
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

            <SidebarFooter className="border-t border-sidebar-border px-3 py-3 group-data-[collapsible=icon]:px-2">
                <SidebarMenu>
                    <SidebarMenuItem>
                        <AccountMenu />
                    </SidebarMenuItem>
                </SidebarMenu>
            </SidebarFooter>
        </Sidebar>
    )
}
