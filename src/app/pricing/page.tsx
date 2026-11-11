import type { Metadata } from "next";
import Link from "next/link";
import {
  MANAGED_SERVER_OFFER as offer,
  getManagedServerCheckoutUrl,
} from "@/config/pricing-plans";

export const metadata: Metadata = {
  title: "Pricing",
  description: offer.description,
};

// The one thing on sale: the managed private server. Its button opens the
// Polar checkout link; after paying, Polar sends the buyer to
// /managed-server/thanks (the link's success URL, set in Polar).
export default function PricingPage() {
  const checkoutUrl = getManagedServerCheckoutUrl();

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-16">
        <div className="mx-auto max-w-xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">Pricing</h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Start building for free. When you want RXJ on a server of your
              own, we set it up and run it for you.
            </p>
          </div>

          <div className="mt-12 flex flex-col rounded-2xl border border-primary bg-background p-6 shadow-lg sm:p-8">
            <h2 className="text-2xl font-semibold">{offer.name}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{offer.description}</p>

            <div className="mt-6 flex items-end gap-1">
              <span className="text-4xl font-bold">{offer.price}</span>
              <span className="mb-1 text-muted-foreground">/month</span>
            </div>

            <ul className="mt-8 space-y-3">
              {offer.features.map((feature) => (
                <li key={feature} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="text-primary" aria-hidden="true">✓</span>
                  {feature}
                </li>
              ))}
            </ul>

            <p className="mt-6 text-xs text-muted-foreground">{offer.note}</p>

            {checkoutUrl ? (
              <a
                href={checkoutUrl}
                className="mt-8 w-full rounded-xl bg-primary px-4 py-3 text-center text-sm font-medium text-primary-foreground transition-all hover:opacity-90"
              >
                Get your private server
              </a>
            ) : (
              <span className="mt-8 w-full cursor-not-allowed rounded-xl border bg-muted px-4 py-3 text-center text-sm font-medium text-muted-foreground">
                Coming soon
              </span>
            )}
          </div>

          <p className="mt-10 text-center text-sm text-muted-foreground">
            Prefer to run it yourself? RXJ is free to self-host:{" "}
            <Link href="/docs" className="underline underline-offset-4">
              see the docs
            </Link>
            . Cancel the managed server at any time from the link in your
            Polar receipt.
          </p>
        </div>
      </div>
    </div>
  );
}
