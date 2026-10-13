import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { DOCS_SECTIONS } from "../lib/docs-content";
import { AuthLink } from "./auth-link";
import { MarketingShell } from "./marketing-shell";

export const DocsPage = () => (
  <MarketingShell
    eyebrow="Docs"
    title="Getting started with RXJ"
    lead="From a new account to a workflow that runs by itself: triggers, credentials, expressions, AI agents and monitoring."
  >
    <div className="bg-m-bg py-14 sm:py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="m-eyebrow">On this page</h2>
          <ol className="mt-4 space-y-2.5 text-sm">
            {DOCS_SECTIONS.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-m-muted transition-colors hover:text-m-fg"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="max-w-3xl space-y-16">
          {DOCS_SECTIONS.map((section, index) => (
            <section
              key={section.id}
              id={section.id}
              aria-labelledby={`${section.id}-title`}
              className="scroll-mt-24"
            >
              <p className="m-eyebrow">{String(index + 1).padStart(2, "0")}</p>
              <h2
                id={`${section.id}-title`}
                className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                {section.title}
              </h2>
              <p className="mt-4 leading-relaxed text-m-muted">
                {section.intro}
              </p>

              {section.items && (
                <dl className="m-card mt-6 divide-y divide-m-line">
                  {section.items.map((item) => (
                    <div
                      key={item.term}
                      className="grid gap-1 p-5 sm:grid-cols-[11rem_minmax(0,1fr)] sm:gap-6"
                    >
                      <dt className="text-sm font-medium text-m-fg">
                        {item.term}
                      </dt>
                      <dd className="text-sm leading-relaxed text-m-muted">
                        {item.text}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}

              {section.table && (
                <div className="m-card mt-6 overflow-x-auto">
                  <table className="w-full min-w-[32rem] text-left text-sm">
                    <thead>
                      <tr className="border-b border-m-line">
                        {section.table.head.map((cell) => (
                          <th
                            key={cell}
                            scope="col"
                            className="p-4 font-medium text-m-fg"
                          >
                            {cell}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-m-line">
                      {section.table.rows.map(([code, meaning]) => (
                        <tr key={code}>
                          <td className="p-4 align-top">
                            <code className="font-mono text-[0.8125rem] text-m-accent">
                              {code}
                            </code>
                          </td>
                          <td className="p-4 align-top text-m-muted">
                            {meaning}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {section.note && (
                <p className="mt-5 border-l-2 border-m-accent pl-4 text-sm leading-relaxed text-m-muted">
                  {section.note}
                </p>
              )}

              {section.id === "plans" && (
                <p className="mt-5 text-sm">
                  <Link href="/pricing" className="m-link">
                    See the plans and prices
                  </Link>
                </p>
              )}
            </section>
          ))}

          <div className="m-card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
            <div>
              <h2 className="m-h3">Ready to build?</h2>
              <p className="mt-1 text-sm text-m-muted">
                Seven days with the plan-locked nodes open. No credit card
                required.
              </p>
            </div>
            <AuthLink
              className="m-btn m-btn-primary shrink-0"
              signedInLabel="Go to dashboard"
            >
              Start free trial
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </AuthLink>
          </div>
        </div>
      </div>
    </div>
  </MarketingShell>
);
