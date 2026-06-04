export const isTrialActive = (
  trialEndsAt: Date | null
) => {
  if (!trialEndsAt) return false;

  return new Date(trialEndsAt) > new Date();
};