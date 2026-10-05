// The public address of this app, without a trailing slash. Webhook URLs
// given to other services (Telegram, Google, Meta) are built from it.
export const getAppUrl = () =>
  (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/+$/, "");
