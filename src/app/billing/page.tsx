"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query"; // 1. Import QueryClient
import { authClient } from "@/lib/auth-client";
import { UsageCard } from "@/components/subscription/usage-card";
import { AiSpendCard } from "@/features/ai-usage/components/ai-spend-card";
import { AiCreditsCard } from "@/features/ai-credits/components/ai-credits-card";
import { useCurrentPlan } from "@/features/subscription/hook/use-current-plan";

export default function BillingPage() {
  const queryClient = useQueryClient(); // 2. Access the query client cache
  // Billing is the user's own account, whatever workspace they work in
  const { data, isLoading } = useCurrentPlan({ own: true });

  // 3. Invalidate both query keys globally on mount
  useEffect(() => {
    // Forces /api/subscription/current to run, syncing the Prisma database
    queryClient.invalidateQueries({ queryKey: ["current-plan"] });
    
    // Forces Better Auth's plugin state to pull down the newest Polar state
    queryClient.invalidateQueries({ queryKey: ["subscription"] });
  }, [queryClient]);

  if (isLoading) {
    return (
      <div className="p-6">
        Loading billing...
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-5xl py-10">
      <div>
        <h1 className="text-3xl font-bold">
          Billing
        </h1>

        <p className="mt-2 text-muted-foreground">
          AI credits, invoices and payments.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          {/* There are no plans: every account has every node and feature */}
          <div className="rounded-2xl border p-6">
            <h2 className="text-lg font-semibold">
              Every feature, on every account
            </h2>

            <p className="mt-2 text-sm text-muted-foreground">
              RXJ has no plans. Every account can use every node and template, within
              the same monthly limits. A managed private server has no limits at all.
            </p>

            <button
              onClick={() => {
                window.location.href = "/pricing";
              }}
              className="mt-6 rounded-xl border px-4 py-2 text-sm hover:bg-muted"
            >
              See the managed private server
            </button>
          </div>

          <div className="rounded-2xl border p-6">
            <h3 className="text-lg font-semibold">
              Billing Portal
            </h3>

            <p className="mt-2 text-sm text-muted-foreground">
              Invoices, payment methods, and any subscription you have, such as a
              managed private server or a plan from before plans ended (cancel it
              here).
            </p>

            <button
              onClick={() => {
                authClient.customer.portal();
              }}
              className="mt-6 rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground hover:opacity-90"
            >
              Open Billing Portal
            </button>
          </div>

          <AiCreditsCard />

          <AiSpendCard />
        </div>

        <div>
          <UsageCard
            plan={data?.plan ?? "FREE"}
            workflowsUsed={
              data?.workflowCount ?? 0
            }
            executionsUsed={
              data?.executionsUsed ?? 0
            }
          />
        </div>
      </div>
    </div>
  );
}