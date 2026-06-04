import { authClient } from "@/lib/auth-client";
import { useQuery } from "@tanstack/react-query";

export const useSubscription = () => {
  return useQuery({
    queryKey: ["subscription"],

    queryFn: async () => {
      const { data } =
        await authClient.customer.state();

      return data;
    },
  });
};

export const useHasActiveSubscription = () => {
  const {
    data: customerState,
    isLoading,
    ...rest
  } = useSubscription();

  const polarSubscriptionActive =
    !!customerState?.activeSubscriptions &&
    customerState.activeSubscriptions.length > 0;

  const subscription =
    customerState?.activeSubscriptions?.[0];

  const subscriptionSlug =
    (
      subscription as {
        product?: {
          slug?: string;
        };
      }
    )?.product?.slug ?? null;

  return {
    hasActiveSubscription:
      polarSubscriptionActive,

    subscription,

    subscriptionSlug,

    isLoading,

    ...rest,
  };
};