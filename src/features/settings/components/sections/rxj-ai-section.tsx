"use client";

import { useQuery } from "@tanstack/react-query";
import { IncludedAiCard } from "@/features/ai-credits/components/included-ai-card";
import { useTRPC } from "@/trpc/client";
import { SectionNote, SectionSkeleton } from "../settings-section";

/**
 * Settings → AI → RXJ AI included: the platform's admins set up its
 * providers. The card itself asks an admin without two-factor to turn it on
 * first.
 */
export const RxjAiSection = () => {
    const trpc = useTRPC();
    // The same query the card reads
    const { data, isLoading } = useQuery(trpc.aiCredits.getProviders.queryOptions());

    if (isLoading) return <SectionSkeleton rows={4} />;

    if (!data?.isAdmin) {
        return (
            <SectionNote title="Admins only">
                RXJ AI (included) is set up by the platform&apos;s admins. What your plan
                includes and what is left is under Usage &amp; plan and Billing.
            </SectionNote>
        );
    }

    return <IncludedAiCard />;
};
