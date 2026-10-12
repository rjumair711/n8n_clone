import { useQuery } from "@tanstack/react-query";

// The plan of the workspace the browser is in (its owner's). With `own`,
// the signed-in user's own plan: what the billing page is about.
export const useCurrentPlan = ({ own = false }: { own?: boolean } = {}) => {
  return useQuery({
    queryKey: own ? ["current-plan", "own"] : ["current-plan"],

    queryFn: async () => {
      const response = await fetch(
        own ? "/api/subscription/current?own=1" : "/api/subscription/current"
      );

      if (!response.ok) {
        throw new Error(
          "Failed to fetch subscription"
        );
      }

      return response.json();
    },
  });
};