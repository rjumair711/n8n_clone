"use client";

// Used by one page each: git-sync, secrets and sso. They share this file
// because they share the enterprise cards' module.

import { useQuery } from "@tanstack/react-query";
import {
    GitSyncCard,
    SecretStoresCard,
    SsoCard,
} from "@/features/enterprise/components/enterprise-cards";
import { hasRole } from "@/lib/workspace-roles";
import { useTRPC } from "@/trpc/client";
import { SectionNote, SectionSkeleton } from "../settings-section";

const PlanRequired = ({ plan }: { plan: string }) => (
    <SectionNote title={`Requires ${plan}`}>
        This needs the {plan} plan: the plan of the workspace&apos;s owner.
    </SectionNote>
);

const AdminsOnly = () => (
    <SectionNote title="Owners and admins only">
        Only the workspace&apos;s owner and admins can set this up.
    </SectionNote>
);

/**
 * The gate the server applies to Git sync and secret stores: the owner's
 * plan has to include it, and changes need a workspace admin.
 */
const useEnterpriseGate = (requiredPlan: string | null | undefined, loading: boolean) => {
    const trpc = useTRPC();
    const { data: current, isLoading } = useQuery(trpc.workspaces.getCurrent.queryOptions());

    if (loading || isLoading || !current) return <SectionSkeleton rows={4} />;
    if (requiredPlan) return <PlanRequired plan={requiredPlan} />;
    if (!hasRole(current.current.role, "ADMIN")) return <AdminsOnly />;

    return null;
};

/** Settings → Enterprise → Git sync */
export const GitSyncSection = () => {
    const trpc = useTRPC();
    const { data, isLoading } = useQuery(trpc.enterprise.getGit.queryOptions());
    const gate = useEnterpriseGate(data?.requiredPlan, isLoading || !data);

    return gate ?? <GitSyncCard />;
};

/** Settings → Enterprise → External secrets */
export const SecretsSection = () => {
    const trpc = useTRPC();
    const { data, isLoading } = useQuery(trpc.enterprise.getSecretStores.queryOptions());
    const gate = useEnterpriseGate(data?.requiredPlan, isLoading || !data);

    return gate ?? <SecretStoresCard />;
};

/**
 * Settings → Enterprise → SSO: providers belong to the user's own account,
 * and the card says itself when the plan includes none.
 */
export const SsoSection = () => {
    const trpc = useTRPC();
    const { data, isLoading } = useQuery(trpc.enterprise.getSso.queryOptions());

    if (isLoading || !data) return <SectionSkeleton rows={4} />;

    return <SsoCard />;
};
