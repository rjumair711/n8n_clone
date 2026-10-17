"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { SETTINGS_GROUPS, SETTINGS_SECTIONS, settingsHref } from "../lib/sections";

const isActive = (pathname: string, slug: string) => pathname === settingsHref(slug);

/**
 * The menu of Settings: grouped on the left from md up, and a row of tabs
 * that scrolls sideways on phones. Links use the default prefetch.
 */
export const SettingsNav = () => {
    const pathname = usePathname();
    const tabs = useRef<HTMLDivElement>(null);

    // The open tab is scrolled into view on phones
    useEffect(() => {
        const active = tabs.current?.querySelector<HTMLElement>("[data-active=true]");
        active?.scrollIntoView({ block: "nearest", inline: "center" });
    }, [pathname]);

    return (
        <>
            <nav aria-label="Settings" className="hidden w-52 shrink-0 md:block">
                <div className="sticky top-6 space-y-5">
                    {SETTINGS_GROUPS.map((group) => (
                        <div key={group.title}>
                            <p className="px-3 pb-1.5 text-xs font-medium text-muted-foreground">
                                {group.title}
                            </p>
                            <ul className="space-y-0.5">
                                {group.sections.map((section) => {
                                    const active = isActive(pathname, section.slug);

                                    return (
                                        <li key={section.slug}>
                                            <Link
                                                href={settingsHref(section.slug)}
                                                aria-current={active ? "page" : undefined}
                                                className={cn(
                                                    "flex h-8 items-center rounded-md px-3 text-sm transition-colors",
                                                    active
                                                        ? "bg-accent font-medium text-accent-foreground"
                                                        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                                                )}
                                            >
                                                {section.title}
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))}
                </div>
            </nav>

            <div
                ref={tabs}
                role="navigation"
                aria-label="Settings"
                className="-mx-4 flex gap-1 overflow-x-auto border-b px-4 md:hidden"
            >
                {SETTINGS_SECTIONS.map((section) => {
                    const active = isActive(pathname, section.slug);

                    return (
                        <Link
                            key={section.slug}
                            href={settingsHref(section.slug)}
                            data-active={active}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                                "-mb-px shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors",
                                active
                                    ? "border-primary font-medium text-foreground"
                                    : "border-transparent text-muted-foreground hover:text-foreground"
                            )}
                        >
                            {section.title}
                        </Link>
                    );
                })}
            </div>
        </>
    );
};
