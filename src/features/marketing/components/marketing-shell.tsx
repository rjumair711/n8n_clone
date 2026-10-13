import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { display } from "../lib/fonts";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

/**
 * The frame of a public page other than the landing page: the navbar, a
 * dark header with the page's title, the content and the footer.
 */
export const MarketingShell = ({
  eyebrow,
  title,
  lead,
  children,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  children: ReactNode;
}) => (
  <div className={cn(display.variable, "mkt mkt-page min-h-screen")}>
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-[#0a0b1e]"
    >
      Skip to content
    </a>

    <SiteNav />

    <main id="main">
      <header className="mkt-ink relative overflow-hidden pb-14 pt-32 sm:pb-16 sm:pt-36">
        <div className="m-hero-bg" aria-hidden="true" />
        <div className="relative mx-auto w-full max-w-6xl px-4 sm:px-6">
          <p className="m-eyebrow">{eyebrow}</p>
          <h1 className="m-h2 mt-3 max-w-3xl">{title}</h1>
          <p className="m-lead mt-4 max-w-2xl">{lead}</p>
        </div>
      </header>

      {children}
    </main>

    <SiteFooter />
  </div>
);
