"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CreditCardIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PLAN_LIMITS } from "@/config/plans";
import { formatCredits } from "@/config/ai-credits";
import { SectionSkeleton } from "@/features/settings/components/settings-section";
import { PLAN_NAMES } from "@/features/templates/lib/template-data";
import { formatUsd } from "@/lib/ai-cost";
import { getTrialDaysLeft } from "@/lib/subscription/get-trial-days-left";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useCurrentPlan } from "../hook/use-current-plan";

// Above this share of a limit the bar turns amber; at the limit, red
const WARN_SHARE = 0.8;

const Meter = ({
    label,
    hint,
    used,
    limit,
    loading,
}: {
    label: string;
    hint?: string;
    used: number | undefined;
    limit: number;
    loading?: boolean;
}) => {
    const unlimited = !Number.isFinite(limit);
    const share = unlimited || limit <= 0 ? 0 : Math.min((used ?? 0) / limit, 1);
    const full = !unlimited && (used ?? 0) >= limit;
    const warn = !full && share > WARN_SHARE;

    return (
        <div className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-4 text-sm">
                <span className="font-medium">
                    {label}
                    {hint && <span className="ml-1.5 text-xs font-normal text-muted-foreground">{hint}</span>}
                </span>
                {loading || used === undefined ? (
                    <Skeleton className="h-4 w-16" />
                ) : (
                    <span
                        className={cn(
                            "tabular-nums",
                            full && "text-destructive",
                            warn && "text-amber-600 dark:text-amber-500"
                        )}
                    >
                        {used.toLocaleString("en-US")} / {unlimited ? "Unlimited" : limit.toLocaleString("en-US")}
                    </span>
                )}
            </div>
            <div
                className="h-2 rounded-full bg-muted"
                role="progressbar"
                aria-label={label}
                aria-valuemin={0}
                aria-valuemax={unlimited ? undefined : limit}
                aria-valuenow={used}
            >
                <div
                    className={cn(
                        "h-2 rounded-full transition-[width]",
                        full ? "bg-destructive" : warn ? "bg-amber-500" : "bg-primary"
                    )}
                    style={{ width: `${share * 100}%` }}
                />
            </div>
        </div>
    );
};

const Stat = ({
    label,
    value,
    detail,
    loading,
}: {
    label: string;
    value: React.ReactNode;
    detail?: React.ReactNode;
    loading?: boolean;
}) => (
    <div className="rounded-lg border p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        {loading ? (
            <>
                <Skeleton className="mt-2 h-7 w-24" />
                <Skeleton className="mt-2 h-3 w-36" />
            </>
        ) : (
            <>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
                {detail && <p className="mt-1 text-xs text-muted-foreground">{detail}</p>}
            </>
        )}
    </div>
);

/**
 * Settings → Workspace → Usage & plan: the plan of the workspace the user
 * works in (its owner's), what it used this month against the plan's
 * limits, and its AI credits and spend. The numbers are the ones the limits
 * are checked against on the server.
 */
export const UsagePlanCard = () => {
    const trpc = useTRPC();
    const { data: current, isLoading } = useCurrentPlan();
    // Only the count is needed: one row is enough to get it
    const { data: credentials } = useQuery(
        trpc.credentials.getMany.queryOptions({ page: 1, pageSize: 1, search: "" })
    );
    const { data: credits, isLoading: creditsLoading } = useQuery(
        trpc.aiCredits.getStatus.queryOptions()
    );
    const { data: spend, isLoading: spendLoading } = useQuery(
        trpc.aiUsage.getMonthly.queryOptions()
    );

    if (isLoading || !current) return <SectionSkeleton rows={4} />;

    const plan = current.plan in PLAN_LIMITS ? (current.plan as keyof typeof PLAN_LIMITS) : "FREE";
    const limits = PLAN_LIMITS[plan];
    const planName = PLAN_NAMES[plan] ?? plan;
    const trialDaysLeft = getTrialDaysLeft(current.trialEndsAt ?? null);
    const onTrial = plan === "FREE" && !!current.trialEndsAt;
    const creditsSetUp = !!credits && (credits.available || credits.purchasedUsd > 0);

    return (
        <div className="space-y-4">
            <Card className="shadow-none">
                <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1.5">
                        <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                            {planName} plan
                            {onTrial && (
                                <Badge variant={trialDaysLeft > 0 ? "secondary" : "destructive"}>
                                    {trialDaysLeft > 0
                                        ? `Trial: ${trialDaysLeft} day${trialDaysLeft === 1 ? "" : "s"} left`
                                        : "Trial ended"}
                                </Badge>
                            )}
                        </CardTitle>
                        <CardDescription>
                            The plan and its limits belong to the workspace{" "}
                            <strong>{current.workspace.name}</strong>: they are its
                            owner&apos;s plan, whoever works in it.
                            {!current.workspace.personal &&
                                " This is not your own workspace, so these are not your own account's numbers."}{" "}
                            Billing is about your own account (your plan, payments and invoices),
                            whichever workspace you work in.
                        </CardDescription>
                    </div>
                    <Button asChild variant="outline" size="sm">
                        <Link href="/billing">
                            <CreditCardIcon className="size-4" />
                            Manage billing
                        </Link>
                    </Button>
                </CardHeader>
                <CardContent className="space-y-5">
                    <Meter label="Workflows" used={current.workflowCount} limit={limits.activeWorkflows} />
                    <Meter
                        label="Executions"
                        hint="this month (UTC)"
                        used={current.executionsUsed}
                        limit={limits.monthlyExecutions}
                    />
                    <Meter
                        label="Credentials"
                        used={credentials?.totalCount}
                        limit={limits.credentials}
                        loading={!credentials}
                    />
                    <p className="text-xs text-muted-foreground">
                        Executions count every run since the 1st (UTC) and only go up: deleting
                        executions or workflows does not give any back.
                    </p>
                </CardContent>
            </Card>

            <div className="grid gap-4 sm:grid-cols-2">
                <Stat
                    label="AI credits left"
                    loading={creditsLoading}
                    value={creditsSetUp ? formatCredits(credits.availableUsd) : "—"}
                    detail={
                        creditsSetUp
                            ? `${formatCredits(credits.allowanceLeftUsd)} of this month's ${formatCredits(credits.allowanceUsd)} from the plan${
                                credits.purchasedUsd > 0 ? `, ${formatCredits(credits.purchasedUsd)} bought` : ""
                            }`
                            : "RXJ AI (included) is not set up on this server."
                    }
                />
                <Stat
                    label="AI spend this month"
                    loading={spendLoading}
                    value={spend ? formatUsd(spend.costUsd) : "—"}
                    detail={
                        spend
                            ? spend.budgetCents !== null
                                ? `of a ${formatUsd(spend.budgetCents / 100)} monthly budget`
                                : "No monthly AI budget set"
                            : "AI spend could not be loaded."
                    }
                />
            </div>
        </div>
    );
};
