import { LEGAL, type LegalSection } from "../lib/legal-content";
import { MarketingShell } from "./marketing-shell";

/**
 * A long legal page (Terms, Privacy): a table of contents beside numbered
 * sections, the same layout as the Docs page.
 */
export const LegalPage = ({
  eyebrow,
  title,
  lead,
  sections,
}: {
  eyebrow: string;
  title: string;
  lead: string;
  sections: LegalSection[];
}) => (
  <MarketingShell eyebrow={eyebrow} title={title} lead={lead}>
    <div className="bg-m-bg py-14 sm:py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-12 px-4 sm:px-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <h2 className="m-eyebrow">On this page</h2>
          <ol className="mt-4 space-y-2.5 text-sm">
            {sections.map((section) => (
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

        <div className="max-w-3xl">
          <p className="text-sm text-m-muted">Last updated {LEGAL.updated}</p>
          <div className="mt-10 space-y-12">
            {sections.map((section, index) => (
              <section
                key={section.id}
                id={section.id}
                aria-labelledby={`${section.id}-title`}
                className="scroll-mt-24"
              >
                <h2
                  id={`${section.id}-title`}
                  className="font-display text-xl font-semibold tracking-tight sm:text-2xl"
                >
                  {index + 1}. {section.title}
                </h2>
                <div className="mt-3 space-y-3 leading-relaxed text-m-muted">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.list && (
                  <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed text-m-muted">
                    {section.list.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  </MarketingShell>
);

export const ContactPage = () => (
  <MarketingShell
    eyebrow="Contact"
    title="Get in touch"
    lead="Questions, support, billing or a privacy request: write to us and we answer within two working days."
  >
    <div className="bg-m-bg py-14 sm:py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-5 px-4 sm:grid-cols-2 sm:px-6">
        <div className="m-card p-6 sm:p-7">
          <h2 className="m-h3">Email</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
            Support, billing and everything else:
          </p>
          <a href={`mailto:${LEGAL.email}`} className="m-link mt-3 inline-block break-all">
            {LEGAL.email}
          </a>
        </div>
        <div className="m-card p-6 sm:p-7">
          <h2 className="m-h3">Privacy and data deletion</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
            To get a copy of your data or delete your account, email us from
            the address you signed up with. See{" "}
            <a href="/privacy#data-deletion" className="m-link">
              how deletion works
            </a>
            .
          </p>
        </div>
        <div className="m-card p-6 sm:p-7 sm:col-span-2">
          <h2 className="m-h3">Who runs RXJ</h2>
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-m-muted">
            RXJ is run by {LEGAL.operator}, {LEGAL.country}. Read the{" "}
            <a href="/terms" className="m-link">
              Terms of Service
            </a>{" "}
            and the{" "}
            <a href="/privacy" className="m-link">
              Privacy Policy
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  </MarketingShell>
);
