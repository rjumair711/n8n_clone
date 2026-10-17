"use client";

import { useQuery } from "@tanstack/react-query";
import { AiSpendCard } from "@/features/ai-usage/components/ai-spend-card";
import { hasRole } from "@/lib/workspace-roles";
import { useTRPC } from "@/trpc/client";
import { SectionSkeleton } from "../settings-section";

/**
 * Settings → AI → AI budgets: this month's AI spend of the workspace and
 * its monthly budget. Setting the budget needs a workspace admin, the same
 * rule the server applies.
 */
export const AiBudgetsSection = () => {
    const trpc = useTRPC();
    const { data: current, isLoading } = useQuery(trpc.workspaces.getCurrent.queryOptions());

    if (isLoading || !current) return <SectionSkeleton rows={3} />;

    return <AiSpendCard canEditBudget={hasRole(current.current.role, "ADMIN")} />;
};
