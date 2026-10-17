"use client";

import { useQuery } from "@tanstack/react-query";
import { ModelPricesCard } from "@/features/ai-usage/components/model-prices-card";
import { useTRPC } from "@/trpc/client";
import { SectionNote, SectionSkeleton } from "../settings-section";

/**
 * Settings → AI → Model prices: the platform's admins set them. The card
 * itself asks an admin without two-factor to turn it on first.
 */
export const ModelPricesSection = () => {
    const trpc = useTRPC();
    const { data: security, isLoading } = useQuery(trpc.settings.getSecurity.queryOptions());

    if (isLoading) return <SectionSkeleton rows={4} />;

    if (!security?.isAdmin) {
        return (
            <SectionNote title="Admins only">
                Model prices are set by the platform&apos;s admins. AI spend and budgets use
                them to estimate what each model call cost.
            </SectionNote>
        );
    }

    return <ModelPricesCard />;
};
