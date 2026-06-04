import { SubscriptionPlan } from "@prisma/client";


export const hasPlatformAccess = ({
  plan,
  trialEndsAt,
  hasActiveSubscription,
}: {
  plan: SubscriptionPlan;
  trialEndsAt: Date | null;
  hasActiveSubscription: boolean;
}) => {
  const now = new Date();

  const hasTrial =
    trialEndsAt &&
    new Date(trialEndsAt) > now;

  return (
    hasTrial ||
    hasActiveSubscription ||
    plan !== SubscriptionPlan.FREE
  );
};