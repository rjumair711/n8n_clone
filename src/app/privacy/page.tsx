import type { Metadata } from "next";
import { LegalPage } from "@/features/marketing/components/legal-page";
import { PRIVACY_SECTIONS } from "@/features/marketing/lib/legal-content";

const TITLE = "Privacy Policy — RXJ";
const DESCRIPTION =
  "What data RXJ collects, how it is used, the services that process it and how to delete it.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/privacy" },
  openGraph: { type: "website", url: "/privacy", siteName: "RXJ", title: TITLE, description: DESCRIPTION },
};

export default function Privacy() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy Policy"
      lead="What we collect, why, who processes it for us, and how to delete it."
      sections={PRIVACY_SECTIONS}
    />
  );
}
