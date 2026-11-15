import type { Metadata } from "next";
import { ContactPage } from "@/features/marketing/components/legal-page";

const TITLE = "Contact — RXJ";
const DESCRIPTION = "How to reach RXJ for support, billing and privacy requests.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/contact" },
  openGraph: { type: "website", url: "/contact", siteName: "RXJ", title: TITLE, description: DESCRIPTION },
};

export default function Contact() {
  return <ContactPage />;
}
