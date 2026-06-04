import { useQuery } from "@tanstack/react-query";

export const useCurrentPlan = () => {
  return useQuery({
    queryKey: ["current-plan"],

    queryFn: async () => {
      const response = await fetch(
        "/api/subscription/current"
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