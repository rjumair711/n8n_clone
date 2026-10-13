import type { Metadata } from "next";
import { DocsPage } from "@/features/marketing/components/docs-page";

const TITLE = "Docs — RXJ";
const DESCRIPTION =
  "Getting started with RXJ: your first workflow, triggers, credentials, expressions, AI agents with approvals, monitoring and chatbots.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/docs" },
  openGraph: {
    type: "article",
    url: "/docs",
    siteName: "RXJ",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function Docs() {
  return <DocsPage />;
}
