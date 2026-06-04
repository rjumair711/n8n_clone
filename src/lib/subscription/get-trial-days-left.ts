export const getTrialDaysLeft = (
  trialEndsAt: Date | string | null
) => {
  if (!trialEndsAt) return 0;

  const end =
    new Date(trialEndsAt).getTime();

  const now = Date.now();

  const diff =
    end - now;

  const days = Math.ceil(
    diff / (1000 * 60 * 60 * 24)
  );

  return Math.max(days, 0);
};