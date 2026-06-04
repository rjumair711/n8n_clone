"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { useHasActiveSubscription } from "@/features/subscription/hook/use-subscription";
import { getUserPlan } from "@/lib/subscription/get-user-plan";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

const plans = [
  {
    name: "Beginner",
    slug: "beginner",
    price: "$4.99",
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
    description: "For advanced AI automation and scaling.",
    features: [
      "Unlimited workflows",
      "100k+ executions",
      "WhatsApp integration",
      "AI Agents",
      "Browser automation",
      "API access",
      "Team collaboration",
    ],
  },
];

export default function PricingPage() {
  const router = useRouter();
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);

  // 💡 1. Extract 'isPending' to know when Better Auth is actively verifying cookies
  const { data: session, isPending: isAuthLoading } = authClient.useSession();

  const {
    hasActiveSubscription,
    subscriptionSlug,
  } = useHasActiveSubscription();

  const currentPlan = getUserPlan({
    hasActiveSubscription,
    subscriptionSlug: subscriptionSlug ?? undefined,
  });

  const handlePlanSelection = async (slug: string) => {
    try {
      setLoadingSlug(slug);

      // 💡 2. Live Callback Fallback: If hook is pending or hasn't caught up, query the session directly
      let currentUser = session?.user;
      if (!currentUser) {
        const liveSession = await authClient.getSession();
        currentUser = liveSession?.data?.user;
      }

      // If both checks fail, they are truly signed out
      if (!currentUser) {
        router.push("/signup");
        return;
      }

      // 🛠️ Hit your subscription billing endpoint
      const response = await fetch("/api/subscription/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planSlug: slug }), // sends e.g. "beginner"
      });

      const data = await response.json();

      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Could not initiate checkout session.");
      }
    } catch (error) {
      console.error("Billing error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setLoadingSlug(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-16 px-4">
        <div className="mx-auto max-w-6xl">
          <div className="text-center">
            <h1 className="text-4xl font-bold tracking-tight">
              Choose Your Plan
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              See our flexible plans. Create an account to start building workflows.
            </p>
          </div>

          <div className="mt-16 grid gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const isCurrentPlan =
                session?.user && currentPlan.toLowerCase() === plan.slug.toLowerCase();
              const isLoading = loadingSlug === plan.slug;

              return (
                <div
                  key={plan.slug}
                  className={cn(
                    "relative flex flex-col rounded-2xl border bg-background p-6 shadow-sm transition-all",
                    plan.popular && "border-primary shadow-lg scale-[1.02]",
                    isCurrentPlan && "border-green-500"
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                      MOST POPULAR
                    </div>
                  )}

                  <div>
                    <h2 className="text-2xl font-semibold">{plan.name}</h2>

                    {isCurrentPlan && (
                      <div className="mt-2 inline-flex rounded-full border border-green-500 px-2 py-1 text-xs font-medium text-green-600">
                        Current Plan
                      </div>
                    )}

                    <p className="mt-2 text-sm text-muted-foreground">
                      {plan.description}
                    </p>

                    <div className="mt-6 flex items-end gap-1">
                      <span className="text-4xl font-bold">{plan.price}</span>
                      <span className="mb-1 text-muted-foreground">/month</span>
                    </div>
                  </div>

                  <ul className="mt-8 flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <li key={feature} className="flex items-center gap-2 text-sm text-muted-foreground">
                        <span className="text-primary">✓</span>
                        {feature}
                      </li>
                    ))}
                  </ul>

                  <button
                    // 💡 3. Keep button disabled while verifying their initial authentication status
                    disabled={isCurrentPlan || !!loadingSlug || isAuthLoading}
                    onClick={() => handlePlanSelection(plan.slug)}
                    className={cn(
                      "mt-10 w-full rounded-xl px-4 py-3 text-sm font-medium transition-all",
                      (isCurrentPlan || !!loadingSlug || isAuthLoading) &&
                      "cursor-not-allowed border bg-muted text-muted-foreground",
                      (!isCurrentPlan && !loadingSlug && !isAuthLoading) &&
                      (plan.popular
                        ? "bg-primary text-primary-foreground hover:opacity-90"
                        : "border hover:bg-muted")
                    )}
                  >
                    {/* 💡 4. Show a loading state until authentication resolves */}
                    {isAuthLoading
                      ? "Verifying Session..."
                      : isCurrentPlan
                        ? "Current Plan"
                        : isLoading
                          ? "Opening Checkout..."
                          : session?.user
                            ? `Upgrade to ${plan.name}`
                            : "Sign Up & Get Started"
                    }
                  </button>
                </div>
              );
            })}
          </div>

          <div className="mt-16 text-center">
            <p className="text-sm text-muted-foreground">
              Upgrade, downgrade, or cancel directly from your workspace dashboard settings at any time.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}