import type { Metadata } from "next";
import { LandingPage } from "@/features/marketing/components/landing-page";
import { display } from "@/features/marketing/lib/fonts";
import { getPublishedTemplates } from "@/features/marketing/lib/landing-templates";

// The landing page is the same for everyone, so it is built once and built
// again at most every hour (for the templates it shows). The few links that
// depend on who is signed in ask the browser.
export const revalidate = 3600;

const TITLE = "RXJ — AI agents and workflow automation";
const DESCRIPTION =
  "Build AI agents that do real work: visual workflows, agents with tools and memory, human approval before risky actions, and any model, including low-cost ones.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    url: "/",
    siteName: "RXJ",
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default async function RootHomepage() {
  const templates = await getPublishedTemplates();

  return (
    <div className={display.variable}>
      <LandingPage templates={templates} />
    </div>
  );
}
