"use client";

import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query"; // 1. Import QueryClient
import { authClient } from "@/lib/auth-client";
import { UsageCard } from "@/components/subscription/usage-card";
import { useCurrentPlan } from "@/features/subscription/hook/use-current-plan";
import { getTrialDaysLeft } from "@/lib/subscription/get-trial-days-left";

export default function BillingPage() {
  const queryClient = useQueryClient(); // 2. Access the query client cache
  const { data, isLoading } = useCurrentPlan();

  const trialDaysLeft = getTrialDaysLeft(
    data?.trialEndsAt ?? null
  );

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
          Billing & Subscription
        </h1>

        <p className="mt-2 text-muted-foreground">
          Manage your subscription,
          usage, and billing settings.
        </p>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-6">
          <div className="rounded-2xl border p-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Current Plan
                </p>

                <h2 className="mt-1 text-2xl font-semibold uppercase tracking-wider">
                  {data?.plan}
                </h2>
              </div>

              <button
                onClick={() => {
                  window.location.href =
                    "/pricing";
                }}
                className="rounded-xl border px-4 py-2 text-sm hover:bg-muted"
              >
                Upgrade Plan
              </button>
            </div>

            <div className="mt-6">
              <p className="text-sm text-muted-foreground">
                Trial Status
              </p>

              <p className="mt-1 text-sm">
                {trialDaysLeft > 0
                  ? `${trialDaysLeft} days remaining`
                  : "Trial expired"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border p-6">
            <h3 className="text-lg font-semibold">
              Billing Portal
            </h3>

            <p className="mt-2 text-sm text-muted-foreground">
              Manage subscriptions,
              payment methods, invoices,
              and cancellations.
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