"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

// The admin area's sections. Customers, Errors and Managed servers come in
// the next steps (docs/ADMIN_DASHBOARD_PLAN.md)
export const ADMIN_SECTIONS = [
    { href: "/admin", title: "Overview" },
    { href: "/admin/support", title: "Support" },
] as const;

export const AdminNav = () => {
    const pathname = usePathname();

    return (
        <nav aria-label="Admin" className="flex gap-1 overflow-x-auto border-b">
            {ADMIN_SECTIONS.map((section) => {
                const active = pathname === section.href;
                return (
                    <Link
                        key={section.href}
                        href={section.href}
                        aria-current={active ? "page" : undefined}
                        className={cn(
                            "-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm transition-colors",
                            active
                                ? "border-primary font-medium text-foreground"
                                : "border-transparent text-muted-foreground hover:text-foreground"
                        )}
                    >
                        {section.title}
                    </Link>
                );
            })}
        </nav>
    );
};
