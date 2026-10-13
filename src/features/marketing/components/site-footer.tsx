import Link from "next/link";
import { cn } from "@/lib/utils";
import { RxjLogo } from "./rxj-logo";

const CONTAINER = "mx-auto w-full max-w-6xl px-4 sm:px-6";

// Only pages that exist are linked. There are no Terms, Privacy or Contact
// pages and no social accounts, so the footer has none of those.
const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#features", label: "Features" },
      { href: "/#use-cases", label: "Use cases" },
      { href: "/#templates", label: "Templates" },
      { href: "/pricing", label: "Pricing" },
    ],
  },
  {
    title: "Resources",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/#how-it-works", label: "How it works" },
      { href: "/#security", label: "Security" },
      { href: "/#faq", label: "FAQ" },
    ],
  },
  {
    title: "Company",
    links: [{ href: "/about", label: "About" }],
  },
  {
    title: "Account",
    links: [
      { href: "/login", label: "Sign in" },
      { href: "/signup", label: "Start free trial" },
    ],
  },
];

export const SiteFooter = () => (
  <footer className="mkt-ink border-t border-m-line py-14">
    <div
      className={cn(
        CONTAINER,
        "grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.4fr_repeat(4,1fr)]",
      )}
    >
      <div className="sm:col-span-2 lg:col-span-1">
        <Link href="/" aria-label="RXJ home" className="inline-flex">
          <RxjLogo height={28} />
        </Link>
        <p className="mt-4 max-w-xs text-sm leading-relaxed text-m-muted">
          AI agents and workflow automation that stay affordable.
        </p>
      </div>

      {COLUMNS.map((column) => (
        <nav key={column.title} aria-label={column.title}>
          <h2 className="text-sm font-medium text-m-fg">{column.title}</h2>
          <ul className="mt-4 space-y-3 text-sm">
            {column.links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-m-muted transition-colors hover:text-m-fg"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      ))}
    </div>

    <div
      className={cn(
        CONTAINER,
        "mt-12 border-t border-m-line pt-6 text-sm text-m-muted",
      )}
    >
      <p>© {new Date().getFullYear()} RXJ. All rights reserved.</p>
    </div>
  </footer>
);
