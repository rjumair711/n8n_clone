"use client";

import { MenuIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { authClient } from "@/lib/auth-client";
import { RxjLogo } from "./rxj-logo";

const NAV_LINKS = [
  { href: "/#features", label: "Features" },
  { href: "/#use-cases", label: "Use cases" },
  { href: "/#templates", label: "Templates" },
  { href: "/#pricing", label: "Pricing" },
  { href: "/docs", label: "Docs" },
];

export const SiteNav = () => {
  const [scrolled, setScrolled] = useState(false);
  const { data: session } = authClient.useSession();
  const signedIn = !!session?.user;

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      data-scrolled={scrolled}
      className="m-nav mkt-ink fixed inset-x-0 top-0 z-40"
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="RXJ home" className="flex items-center">
          <RxjLogo height={26} priority />
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-md px-3 py-2 text-sm text-m-muted transition-colors hover:text-m-fg"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          {signedIn ? (
            <Link href="/workflows" className="m-btn m-btn-sm m-btn-primary">
              Go to dashboard
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="hidden rounded-md px-3 py-2 text-sm text-m-muted transition-colors hover:text-m-fg sm:block"
              >
                Sign in
              </Link>
              <Link href="/signup" className="m-btn m-btn-sm m-btn-primary">
                Start free trial
              </Link>
            </>
          )}

          <Sheet>
            <SheetTrigger asChild>
              <button
                type="button"
                aria-label="Open menu"
                className="grid size-10 place-items-center rounded-md text-m-fg md:hidden"
              >
                <MenuIcon className="size-5" aria-hidden="true" />
              </button>
            </SheetTrigger>
            {/* The sheet is rendered outside the page, so it brings the colours along */}
            <SheetContent
              side="right"
              className="mkt mkt-ink w-[min(20rem,85vw)] border-white/10 bg-m-bg text-m-fg"
            >
              <SheetHeader>
                <SheetTitle className="text-m-fg">
                  <RxjLogo height={22} />
                </SheetTitle>
                <SheetDescription className="sr-only">
                  Site navigation
                </SheetDescription>
              </SheetHeader>
              <nav aria-label="Mobile" className="flex flex-col gap-1 px-4">
                {NAV_LINKS.map((link) => (
                  <SheetClose asChild key={link.href}>
                    <Link
                      href={link.href}
                      className="rounded-md px-3 py-3 text-base text-m-fg hover:bg-white/5"
                    >
                      {link.label}
                    </Link>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-4 flex flex-col gap-2 px-4">
                {signedIn ? (
                  <Link href="/workflows" className="m-btn m-btn-primary">
                    Go to dashboard
                  </Link>
                ) : (
                  <>
                    <Link href="/signup" className="m-btn m-btn-primary">
                      Start free trial
                    </Link>
                    <Link href="/login" className="m-btn m-btn-ghost">
                      Sign in
                    </Link>
                  </>
                )}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
};
