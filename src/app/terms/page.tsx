import type { Metadata } from "next";
import { LegalPage } from "@/features/marketing/components/legal-page";
import { TERMS_SECTIONS } from "@/features/marketing/lib/legal-content";

const TITLE = "Terms of Service — RXJ";
const DESCRIPTION = "The terms for using RXJ, the hosted workflow and AI agent platform.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/terms" },
  openGraph: { type: "website", url: "/terms", siteName: "RXJ", title: TITLE, description: DESCRIPTION },
};

export default function Terms() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of Service"
      lead="The rules for using RXJ, in plain words."
      sections={TERMS_SECTIONS}
    />
  );
}
