// The plans on sale, as the pricing page and the landing page show them.
// The limits the app enforces are in ./plans.ts; the price itself is what
// the product costs in Polar.
export const PRICING_PLANS = [
  {
    name: "Beginner",
    slug: "beginner",
    price: "$4.99",
    popular: false,
    description: "Perfect for beginners and students.",
    features: [
      "5 active workflows",
      "1,000 executions/month",
      "AI nodes",
      "Discord & Slack",
      "Webhook support",
      "Basic execution logs",
    ],
  },
  {
    name: "Intermediate",
    slug: "intermediate",
    price: "$9.99",
    popular: true,
    description: "Best for freelancers and growing businesses.",
    features: [
      "20 active workflows",
      "15k executions/month",
      "Scheduling",
      "Google Sheets",
      "Gmail integration",
      "Advanced execution logs",
      "Priority support",
    ],
  },
  {
    name: "Pro",
    slug: "pro",
    price: "$14.99",
    popular: false,
    description: "For advanced AI automation and scaling.",
    features: [
      "Unlimited workflows",
      "100k+ executions",
      "WhatsApp integration",
      "AI Agents",
      "API access",
    ],
  },
];
