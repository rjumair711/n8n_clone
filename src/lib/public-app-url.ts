// The app's public address, for the webhook, form and API URLs the editor
// shows. Browser-safe: no server imports.
//
// NEXT_PUBLIC_APP_URL is written into the browser code when the app is
// built, which is right for the Vercel app. The self-hosted Docker image is
// built once for every server, without it, so the page uses the address it
// is open at. The server side reads its own value (src/lib/app-url.ts).
export const getPublicAppUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/+$/, "");

  if (typeof window !== "undefined") return window.location.origin;

  return "http://localhost:3000";
};
