import { ArrowRightIcon, CheckIcon, PlayIcon, PlusIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { getNodeLabel } from "@/config/node-labels";
import { PRICING_PLANS } from "@/config/pricing-plans";
import { getTemplateLanguage } from "@/features/templates/lib/template-languages";
import { cn } from "@/lib/utils";
import {
  FAQ,
  FEATURES,
  NODE_COUNT,
  SECURITY,
  STEPS,
  USE_CASES,
} from "../lib/content";
import {
  INTEGRATIONS,
  type Integration,
  MORE_INTEGRATIONS,
} from "../lib/integrations";
import {
  findTemplateFor,
  type LandingTemplate,
  pickFeaturedTemplates,
} from "../lib/landing-templates";
import { NODE_LOGOS } from "../lib/node-logos";
import { AuthLink } from "./auth-link";
import { HeroCanvas } from "./hero-canvas";
import { RxjLogo } from "./rxj-logo";
import { SiteFooter } from "./site-footer";
import { SiteNav } from "./site-nav";

const CONTAINER = "mx-auto w-full max-w-6xl px-4 sm:px-6";

const SectionHeading = ({
  id,
  eyebrow,
  title,
  lead,
  center = false,
}: {
  id: string;
  eyebrow: string;
  title: string;
  lead?: string;
  center?: boolean;
}) => (
  <div className={cn("m-reveal max-w-2xl", center && "mx-auto text-center")}>
    <p className="m-eyebrow">{eyebrow}</p>
    <h2 id={id} className="m-h2 mt-3">
      {title}
    </h2>
    {lead && <p className="m-lead mt-4">{lead}</p>}
  </div>
);

// One brand mark in the current text colour
const BrandGlyph = ({ integration }: { integration: Integration }) =>
  integration.path ? (
    <svg
      viewBox="0 0 24 24"
      className="size-7"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d={integration.path} />
    </svg>
  ) : (
    <span
      aria-hidden="true"
      className="block size-7 bg-current"
      style={{
        maskImage: `url(${integration.mask})`,
        WebkitMaskImage: `url(${integration.mask})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );

const NodeChip = ({ type, label }: { type?: string; label: string }) => {
  const logo = type ? NODE_LOGOS[type as keyof typeof NODE_LOGOS] : undefined;

  return (
    <span className="m-chip">
      {logo && (
        <Image
          src={logo}
          alt=""
          width={14}
          height={14}
          className="size-3.5 rounded-[3px]"
        />
      )}
      {label}
    </span>
  );
};

const TemplateCard = ({ template }: { template: LandingTemplate }) => {
  const language = getTemplateLanguage(template.language);
  const shown = template.nodeTypes.slice(0, 5);
  const more = template.nodeTypes.length - shown.length;

  return (
    <article className="m-card m-card-hover m-reveal flex flex-col p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="m-chip">{template.category}</span>
        <span className="m-chip" lang="en">
          {language.label}
        </span>
      </div>
      <h3 className="m-h3 mt-4" dir={language.dir} lang={language.value}>
        {template.name}
      </h3>
      <p
        className="mt-2 line-clamp-3 text-sm leading-relaxed text-m-muted"
        dir={language.dir}
        lang={language.value}
      >
        {template.description}
      </p>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {shown.map((type) => (
          <NodeChip key={type} type={type} label={getNodeLabel(type)} />
        ))}
        {more > 0 && <span className="m-chip">+{more} more</span>}
      </div>
      <div className="mt-auto pt-6">
        <AuthLink
          signedInHref="/templates"
          className="m-btn m-btn-sm m-btn-ghost"
          aria-label={`Use template: ${template.name}`}
        >
          Use template
          <ArrowRightIcon className="size-4" aria-hidden="true" />
        </AuthLink>
      </div>
    </article>
  );
};

const FeatureCard = ({
  feature,
  className,
  children,
}: {
  feature: (typeof FEATURES)[number];
  className?: string;
  children?: ReactNode;
}) => (
  <article
    className={cn(
      "m-card m-card-hover m-reveal flex flex-col p-6 sm:p-7",
      className,
    )}
  >
    <span className="m-icon-tile">
      <feature.icon className="size-5" aria-hidden="true" />
    </span>
    <h3 className="m-h3 mt-5">{feature.title}</h3>
    <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
      {feature.text}
    </p>
    <ul className="mt-5 flex flex-wrap gap-1.5">
      {feature.points.map((point) => (
        <li key={point} className="m-chip">
          {point}
        </li>
      ))}
    </ul>
    {children}
  </article>
);

export const LandingPage = ({
  templates,
}: {
  templates: LandingTemplate[];
}) => {
  const featured = pickFeaturedTemplates(templates);
  const [agents, approval, models, chat, documents, builder] = FEATURES;

  return (
    <div className="mkt mkt-page min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-white focus:px-4 focus:py-2 focus:text-[#0a0b1e]"
      >
        Skip to content
      </a>

      <SiteNav />

      <main id="main">
        {/* Hero */}
        <section className="mkt-ink relative overflow-hidden pb-20 pt-32 sm:pb-28 sm:pt-40">
          <div className="m-hero-bg" aria-hidden="true" />

          <div className={cn(CONTAINER, "relative text-center")}>
            <p className="m-eyebrow">AI agents and workflow automation</p>
            <h1 className="m-h1 mx-auto mt-5 max-w-4xl">
              Build AI agents that{" "}
              <span className="m-gradient-text">actually do the work</span>
            </h1>
            <p
              className="m-lead m-enter mx-auto mt-6 max-w-2xl"
              style={{ "--delay": "0.05s" } as CSSProperties}
            >
              Visual workflows, AI agents with tools, human approval before
              risky actions, and any model you like, including the low-cost
              ones.
            </p>

            <div
              className="m-enter mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              style={{ "--delay": "0.12s" } as CSSProperties}
            >
              <AuthLink
                className="m-btn m-btn-primary w-full sm:w-auto"
                signedInLabel="Go to dashboard"
              >
                Start free trial — 7 days
              </AuthLink>
              <a href="#demo" className="m-btn m-btn-ghost w-full sm:w-auto">
                <PlayIcon className="size-4" aria-hidden="true" />
                See it in action
              </a>
            </div>
            {/* True of the sign-up flow: an email and password or Google / GitHub, no payment step */}
            <p className="mt-4 text-sm text-m-muted">No credit card required</p>

            <div
              id="demo"
              className="m-enter mx-auto mt-14 max-w-5xl scroll-mt-24 sm:mt-20"
              style={{ "--delay": "0.2s" } as CSSProperties}
            >
              <HeroCanvas />
            </div>
          </div>
        </section>

        {/* Integrations */}
        <section
          aria-labelledby="integrations-title"
          className="border-b border-m-line bg-m-bg py-16 sm:py-20"
        >
          <div className={CONTAINER}>
            <h2
              id="integrations-title"
              className="m-reveal text-center font-display text-xl font-semibold tracking-tight sm:text-2xl"
            >
              Works with the tools you already use
            </h2>
            <ul className="m-reveal mt-10 grid grid-cols-4 gap-x-2 gap-y-8 sm:grid-cols-5 lg:grid-cols-10">
              {INTEGRATIONS.map((integration) => (
                <li
                  key={integration.name}
                  className="flex flex-col items-center gap-2.5 text-m-muted"
                >
                  <span className="text-m-fg opacity-80">
                    <BrandGlyph integration={integration} />
                  </span>
                  <span className="text-center text-xs">
                    {integration.name}
                  </span>
                </li>
              ))}
            </ul>
            <p className="m-reveal mx-auto mt-10 max-w-2xl text-center text-sm text-m-muted">
              Also {MORE_INTEGRATIONS.join(", ")} and more: {NODE_COUNT} nodes
              in all, plus an HTTP Request node for anything with an API.
            </p>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          aria-labelledby="features-title"
          className="scroll-mt-16 bg-m-surface py-20 sm:py-28"
        >
          <div className={CONTAINER}>
            <SectionHeading
              id="features-title"
              eyebrow="Features"
              title="Agents you can trust with real work"
              lead="Everything an agent needs to act for you, and everything you need to stay in charge of what it does."
            />

            <div className="mt-12 grid gap-4 md:grid-cols-6">
              <FeatureCard feature={agents} className="md:col-span-4" />
              <FeatureCard feature={approval} className="md:col-span-2" />
              <FeatureCard feature={models} className="md:col-span-2" />
              <FeatureCard feature={chat} className="md:col-span-2" />
              <FeatureCard feature={documents} className="md:col-span-2" />
              <FeatureCard feature={builder} className="md:col-span-6">
                <div
                  aria-hidden="true"
                  className="mt-6 rounded-xl border border-m-line bg-m-surface p-4 font-mono text-sm text-m-muted"
                >
                  <span className="text-m-accent">Build with AI ›</span> When a
                  Shopify order is paid, send the customer a WhatsApp
                  confirmation and add the order to a Google Sheet
                </div>
              </FeatureCard>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          aria-labelledby="how-title"
          className="scroll-mt-16 bg-m-bg py-20 sm:py-28"
        >
          <div className={CONTAINER}>
            <SectionHeading
              id="how-title"
              eyebrow="How it works"
              title="From idea to a running workflow in three steps"
            />
            <ol className="mt-12 grid gap-4 md:grid-cols-3">
              {STEPS.map((step, index) => (
                <li key={step.title} className="m-card m-reveal p-6 sm:p-7">
                  <span className="font-display text-5xl font-semibold tracking-tight text-m-accent opacity-80">
                    {index + 1}
                  </span>
                  <h3 className="m-h3 mt-4">{step.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
                    {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* Use cases */}
        <section
          id="use-cases"
          aria-labelledby="use-cases-title"
          className="scroll-mt-16 bg-m-surface py-20 sm:py-28"
        >
          <div className={CONTAINER}>
            <SectionHeading
              id="use-cases-title"
              eyebrow="Use cases"
              title="What people build with RXJ"
              lead="Each one is a handful of nodes. The names below are the nodes it uses."
            />
            <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {USE_CASES.map((useCase) => {
                const template = findTemplateFor(templates, useCase.template);

                return (
                  <article
                    key={useCase.title}
                    className="m-card m-card-hover m-reveal flex flex-col p-6"
                  >
                    <h3 className="m-h3">{useCase.title}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
                      {useCase.text}
                    </p>
                    <ul
                      className="mt-4 flex flex-wrap gap-1.5"
                      aria-label="Nodes used"
                    >
                      {useCase.nodes.map((node) => (
                        <li key={node} className="m-chip">
                          {node}
                        </li>
                      ))}
                    </ul>
                    {template && (
                      <p className="mt-auto pt-5 text-sm">
                        <AuthLink
                          signedInHref="/templates"
                          className="m-link inline-flex items-center gap-1"
                        >
                          Template: {template.name}
                          <ArrowRightIcon
                            className="size-3.5"
                            aria-hidden="true"
                          />
                        </AuthLink>
                      </p>
                    )}
                  </article>
                );
              })}

              <article className="m-reveal flex flex-col justify-between rounded-[1.1rem] border border-dashed border-m-line p-6">
                <div>
                  <h3 className="m-h3">Something else in mind?</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
                    Describe it in a sentence and let Build with AI put the
                    first version on the canvas.
                  </p>
                </div>
                <p className="pt-5 text-sm">
                  <AuthLink
                    className="m-link inline-flex items-center gap-1"
                    signedInLabel="Open your workflows"
                  >
                    Start free trial
                    <ArrowRightIcon className="size-3.5" aria-hidden="true" />
                  </AuthLink>
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Security */}
        <section
          id="security"
          aria-labelledby="security-title"
          className="mkt-ink relative scroll-mt-16 overflow-hidden py-20 sm:py-28"
        >
          <div className="m-glow-band" aria-hidden="true" />
          <div className={cn(CONTAINER, "relative")}>
            <SectionHeading
              id="security-title"
              eyebrow="Security and trust"
              title="Built for agents that touch real systems"
              lead="An agent acts on text it has read, and that text can try to give it orders. These limits are part of the product, not an add-on."
            />
            <ul className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {SECURITY.map((item) => (
                <li key={item.title} className="m-reveal">
                  <item.icon
                    className="size-6 text-m-accent"
                    aria-hidden="true"
                  />
                  <h3 className="m-h3 mt-4">{item.title}</h3>
                  <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
                    {item.text}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Templates */}
        <section
          id="templates"
          aria-labelledby="templates-title"
          className="scroll-mt-16 bg-m-bg py-20 sm:py-28"
        >
          <div className={CONTAINER}>
            <SectionHeading
              id="templates-title"
              eyebrow="Templates"
              title="Start from a workflow that already works"
              lead="Copy a template into your account, connect your own apps where it says Not Configured, and run it."
            />

            {featured.length > 0 ? (
              <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {featured.map((template) => (
                  <TemplateCard key={template.id} template={template} />
                ))}
              </div>
            ) : (
              <div className="m-card m-reveal mt-12 p-8 text-center">
                <p className="text-m-muted">
                  The template gallery opens inside the app.
                </p>
                <AuthLink
                  signedInHref="/templates"
                  className="m-btn m-btn-ghost mt-5"
                  signedInLabel="Open templates"
                >
                  Start free trial to browse templates
                </AuthLink>
              </div>
            )}
          </div>
        </section>

        {/* Pricing */}
        <section
          id="pricing"
          aria-labelledby="pricing-title"
          className="scroll-mt-16 bg-m-surface py-20 sm:py-28"
        >
          <div className={CONTAINER}>
            <SectionHeading
              id="pricing-title"
              eyebrow="Pricing"
              title="Plans that stay affordable"
              lead="Every account starts with a 7-day free trial. Upgrade, downgrade or cancel at any time."
              center
            />
            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {PRICING_PLANS.map((plan) => (
                <article
                  key={plan.slug}
                  className={cn(
                    "m-card m-reveal flex flex-col p-6 sm:p-7",
                    plan.popular && "border-transparent ring-2 ring-[#6d4bff]",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="m-h3">{plan.name}</h3>
                    {plan.popular && (
                      <span className="rounded-full bg-[#4b2df5] px-2.5 py-1 text-xs font-medium text-white">
                        Most popular
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-sm text-m-muted">
                    {plan.description}
                  </p>
                  <p className="mt-6 flex items-end gap-1">
                    <span className="font-display text-4xl font-semibold tracking-tight">
                      {plan.price}
                    </span>
                    <span className="mb-1 text-sm text-m-muted">/month</span>
                  </p>
                  <ul className="mt-6 flex-1 space-y-2.5 text-sm text-m-muted">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2">
                        <CheckIcon
                          className="mt-0.5 size-4 shrink-0 text-m-accent"
                          aria-hidden="true"
                        />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <AuthLink
                    signedInHref="/pricing"
                    className={cn(
                      "m-btn mt-8",
                      plan.popular ? "m-btn-primary" : "m-btn-ghost",
                    )}
                    aria-label={`Start free trial, ${plan.name} plan`}
                    signedInLabel="Choose plan"
                  >
                    Start free trial
                  </AuthLink>
                </article>
              ))}
            </div>
            <p className="m-reveal mt-8 text-center text-sm">
              <Link
                href="/pricing"
                className="m-link inline-flex items-center gap-1"
              >
                See full pricing
                <ArrowRightIcon className="size-3.5" aria-hidden="true" />
              </Link>
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section
          id="faq"
          aria-labelledby="faq-title"
          className="scroll-mt-16 bg-m-bg py-20 sm:py-28"
        >
          <div className={cn(CONTAINER, "max-w-3xl")}>
            <SectionHeading
              id="faq-title"
              eyebrow="FAQ"
              title="Questions, answered plainly"
              center
            />
            <div className="mt-10 divide-y divide-m-line border-y border-m-line">
              {FAQ.map((item) => (
                <details key={item.question} className="m-faq group">
                  <summary className="flex items-center justify-between gap-4 py-5 text-left">
                    <h3 className="font-display text-lg font-medium tracking-tight">
                      {item.question}
                    </h3>
                    <PlusIcon
                      className="m-faq-icon size-5 shrink-0 text-m-muted"
                      aria-hidden="true"
                    />
                  </summary>
                  <p className="pb-6 pr-8 text-[0.9375rem] leading-relaxed text-m-muted">
                    {item.answer}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section
          aria-labelledby="cta-title"
          className="mkt-ink relative overflow-hidden py-20 sm:py-28"
        >
          <div className="m-glow-band" aria-hidden="true" />
          <div
            className={cn(
              CONTAINER,
              "m-reveal relative flex flex-col items-center text-center",
            )}
          >
            <RxjLogo height={56} />
            <h2 id="cta-title" className="m-h2 mt-8 max-w-2xl">
              Put your first agent to work today
            </h2>
            <p className="m-lead mt-4 max-w-xl">
              Seven days with every node unlocked. No credit card required.
            </p>
            <AuthLink
              className="m-btn m-btn-primary mt-8"
              signedInLabel="Go to dashboard"
            >
              Start free trial
              <ArrowRightIcon className="size-4" aria-hidden="true" />
            </AuthLink>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
};
