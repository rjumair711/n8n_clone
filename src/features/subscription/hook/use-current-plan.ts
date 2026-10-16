import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTRPCClient } from "@/trpc/client";

// The plan of the workspace the browser is in (its owner's). With `own`,
// the signed-in user's own plan: what the billing page is about.
// Asked through tRPC so it joins the page's batch (one session and
// workspace lookup for all of it); the key stays "current-plan".
export const useCurrentPlan = ({ own = false }: { own?: boolean } = {}) => {
  const trpcClient = useTRPCClient();

  return useQuery({
    queryKey: own ? ["current-plan", "own"] : ["current-plan"],
    queryFn: () => trpcClient.subscription.getCurrent.query({ own }),
  });
};

/**
 * Refreshes the plan and usage numbers (both the workspace's and the
 * user's own) after something that changes them: a workflow created or
 * deleted.
 */
export const useInvalidateUsage = () => {
  const queryClient = useQueryClient();

  return () => queryClient.invalidateQueries({ queryKey: ["current-plan"] });
};
