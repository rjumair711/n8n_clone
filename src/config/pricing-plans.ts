// What is on sale, as the pricing page and the landing page show it: the
// managed private server. The Beginner, Intermediate and Pro plans are no
// longer sold. Accounts that already have one keep it (src/config/plans.ts
// still has their limits, and the Polar webhooks still handle them).

export type PricingOffer = {
  name: string;
  slug: string;
  price: string;
  description: string;
  features: string[];
  note: string;
};

export const MANAGED_SERVER_OFFER: PricingOffer = {
  name: "Managed private server",
  slug: "managed-server",
  price: "$20",
  description: "RXJ on a server of your own, set up and looked after for you.",
  features: [
    "Your own server: your data stays yours",
    "Every feature unlocked on it",
    "Up to 5 of your workflows built and looked after for you",
    "Set up with your domain and HTTPS",
    "Monthly updates and daily backups",
    "Fixed for you when something breaks",
  ],
  note: "More than 5 workflows: priced separately. The server itself is in your name, from Hetzner or similar, about $5–7 a month paid to them.",
};

export const PRICING_OFFERS: PricingOffer[] = [MANAGED_SERVER_OFFER];

/**
 * The Polar checkout link of the managed private server, or null when none
 * is set. NEXT_PUBLIC_MANAGED_SERVER_CHECKOUT_URL: the sandbox link while
 * testing, the production link when the app sells for real. Read when the
 * app is built.
 */
export const getManagedServerCheckoutUrl = (
  value: string | undefined = process.env.NEXT_PUBLIC_MANAGED_SERVER_CHECKOUT_URL
): string | null => {
  const url = value?.trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
};
