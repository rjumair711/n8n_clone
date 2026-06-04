import { SubscriptionPlan } from "@/config/plans";


export const getUserPlan = ({
  hasActiveSubscription,
  subscriptionSlug,
}: {
  hasActiveSubscription: boolean;
  subscriptionSlug?: string;
}): SubscriptionPlan => {
  if (!hasActiveSubscription) {
    return SubscriptionPlan.FREE;
  }

  switch (subscriptionSlug) {
    case "beginner":
      return SubscriptionPlan.BEGINNER;

    case "intermediate":
      return SubscriptionPlan.INTERMEDIATE;

    case "pro":
      return SubscriptionPlan.PRO;

    default:
      return SubscriptionPlan.FREE;
  }
};