import { ArrowRightIcon } from "lucide-react";
import Link from "next/link";
import { ABOUT_PRINCIPLES } from "../lib/about-content";
import { NODE_COUNT } from "../lib/content";
import { AuthLink } from "./auth-link";
import { MarketingShell } from "./marketing-shell";

export const AboutPage = () => (
  <MarketingShell
    eyebrow="About"
    title="Automation and AI agents that stay affordable"
    lead="RXJ is a hosted platform for building workflows and AI agents on a visual canvas, made so that a small team can run them without a large bill."
  >
    <div className="bg-m-bg py-14 sm:py-20">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
        <section aria-labelledby="what-title" className="max-w-3xl">
          <p className="m-eyebrow">What RXJ is</p>
          <h2
            id="what-title"
            className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            One canvas for the work you repeat
          </h2>
          <div className="mt-4 space-y-4 leading-relaxed text-m-muted">
            <p>
              You connect a trigger to the nodes that do the work: read a
              message, look something up, ask a model, write a row, send an
              answer. The editor has {NODE_COUNT} node types, from WhatsApp
              and Gmail to Google Sheets, Shopify and your own HTTP calls.
            </p>
            <p>
              An AI agent can use any of those nodes as a tool, remember each
              contact and hand a task to another agent. You watch every run
              node by node, and you decide which actions wait for a person.
            </p>
          </div>
        </section>

        <section aria-labelledby="principles-title" className="mt-16">
          <p className="m-eyebrow">What we care about</p>
          <h2
            id="principles-title"
            className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            How RXJ is built
          </h2>
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {ABOUT_PRINCIPLES.map((principle) => (
              <li key={principle.title} className="m-card p-6 sm:p-7">
                <span className="m-icon-tile">
                  <principle.icon className="size-5" aria-hidden="true" />
                </span>
                <h3 className="m-h3 mt-5">{principle.title}</h3>
                <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
                  {principle.text}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="m-card mt-16 flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <h2 className="m-h3">See how it works</h2>
            <p className="mt-1 text-sm text-m-muted">
              Read the{" "}
              <Link href="/docs" className="m-link">
                getting-started guide
              </Link>{" "}
              or try it for seven days. No credit card required.
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
  </MarketingShell>
);
