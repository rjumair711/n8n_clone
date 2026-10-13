import type { Metadata } from "next";
import { AboutPage } from "@/features/marketing/components/about-page";

const TITLE = "About — RXJ";
const DESCRIPTION =
  "RXJ is a hosted platform for building workflows and AI agents on a visual canvas, made to stay affordable.";

export const metadata: Metadata = {
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    type: "website",
    url: "/about",
    siteName: "RXJ",
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function About() {
  return <AboutPage />;
}
