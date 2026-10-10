// The security headers every response of the app gets. Used by
// next.config.ts, so: no imports, and nothing that needs the app to run.

type Header = { key: string; value: string };
type HeaderRule = { source: string; headers: Header[] };

/**
 * EXCEPTION POINT for pages that other sites may show in a frame.
 *
 * Everything is served with `X-Frame-Options: DENY`, so no other site can
 * frame the app (clickjacking). An embeddable chat widget needs the
 * opposite for its own route. When that route exists, add its path prefix
 * here, without a trailing slash:
 *
 *   export const EMBEDDABLE_PATH_PREFIXES = ["/embed"];
 *
 * Those paths (the prefix itself and everything under it) then get no
 * X-Frame-Options and no `frame-ancestors 'none'`; give the route its own
 * `Content-Security-Policy: frame-ancestors <the sites allowed to embed it>`
 * instead. Everything else stays DENY.
 */
export const EMBEDDABLE_PATH_PREFIXES: string[] = [];

// Two years, the length browsers' preload lists ask for. Subdomains are
// included; "preload" is left out, because it is hard to take back.
const HSTS = "max-age=63072000; includeSubDomains";

// Features no page of the app uses. Nothing embedded in it may use them
// either.
const PERMISSIONS_POLICY = [
  "accelerometer=()",
  "camera=()",
  "geolocation=()",
  "gyroscope=()",
  "magnetometer=()",
  "microphone=()",
  "payment=()",
  "usb=()",
  "browsing-topics=()",
].join(", ");

/**
 * Sentry's endpoint for Content-Security-Policy reports, from a DSN:
 *   https://<key>@<host>/<project>  ->  https://<host>/api/<project>/security/?sentry_key=<key>
 */
export const getSentryCspReportUri = (dsn: string | undefined | null): string | null => {
  try {
    const url = new URL(dsn ?? "");
    const project = url.pathname.replace(/^\/+|\/+$/g, "");

    if (url.protocol !== "https:" || !url.username || !/^\d+$/.test(project)) return null;

    return `https://${url.host}/api/${project}/security/?sentry_key=${url.username}`;
  } catch {
    return null;
  }
};

/**
 * The Content-Security-Policy of the pages. Sent as
 * Content-Security-Policy-Report-Only for now: browsers report what would
 * be blocked and block nothing, so the policy can be tightened from real
 * reports before it is enforced.
 *
 *   script-src   Next.js puts small inline scripts in every page, hence
 *                'unsafe-inline' (a nonce per request is the next step);
 *                Cloudflare serves the Turnstile widget on sign-up
 *   style-src    components and libraries set inline styles
 *   img-src      node icons, avatars from Google and GitHub, QR codes
 *   connect-src  the app's own API, Inngest Realtime (wss) and Sentry
 *   frame-src    the Turnstile widget is an iframe
 */
export const buildContentSecurityPolicy = ({
  reportUri,
  frameable = false,
  development = false,
}: {
  reportUri?: string | null;
  // For EMBEDDABLE_PATH_PREFIXES: leaves frame-ancestors to the route
  frameable?: boolean;
  // React's dev mode needs eval for its error overlay and fast refresh
  development?: boolean;
} = {}): string =>
  [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${development ? " 'unsafe-eval'" : ""} https://challenges.cloudflare.com`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https: wss:",
    "frame-src 'self' https://challenges.cloudflare.com",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    ...(frameable ? [] : ["frame-ancestors 'none'"]),
    ...(reportUri ? [`report-uri ${reportUri}`] : []),
  ].join("; ");

const escapeForPath = (prefix: string) =>
  prefix.replace(/^\/+|\/+$/g, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A Next.js `source` for every path except the given prefixes and
 * everything under them.
 */
export const allPathsExcept = (prefixes: readonly string[]): string => {
  const excluded = prefixes.map(escapeForPath).filter(Boolean);

  return excluded.length === 0
    ? "/:path*"
    : `/((?!(?:${excluded.join("|")})(?:/|$)).*)`;
};

/**
 * The rules for `headers()` in next.config.ts.
 *
 *   every path       HSTS (production only), nosniff, Permissions-Policy
 *   not embeddable   X-Frame-Options: DENY
 *   pages (not /api) Referrer-Policy and the report-only CSP. API routes
 *                    set their own where it matters (file downloads,
 *                    webhook responses) and return no documents otherwise.
 */
export const getSecurityHeaderRules = ({
  production = process.env.NODE_ENV === "production",
  reportUri = null,
  embeddablePrefixes = EMBEDDABLE_PATH_PREFIXES,
}: {
  production?: boolean;
  reportUri?: string | null;
  embeddablePrefixes?: readonly string[];
} = {}): HeaderRule[] => {
  const cspHeader = (frameable: boolean): Header => ({
    key: "Content-Security-Policy-Report-Only",
    value: buildContentSecurityPolicy({ reportUri, frameable, development: !production }),
  });

  const referrer: Header = {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  };

  return [
    {
      source: "/:path*",
      headers: [
        // Browsers ignore it on plain http, and localhost must stay reachable
        // without https
        ...(production ? [{ key: "Strict-Transport-Security", value: HSTS }] : []),
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "Permissions-Policy", value: PERMISSIONS_POLICY },
      ],
    },
    {
      source: allPathsExcept(embeddablePrefixes),
      headers: [{ key: "X-Frame-Options", value: "DENY" }],
    },
    {
      source: allPathsExcept(["/api", ...embeddablePrefixes]),
      headers: [referrer, cspHeader(false)],
    },
    // Embeddable pages: the same policy without frame-ancestors
    ...embeddablePrefixes
      .map((prefix) => `/${prefix.replace(/^\/+|\/+$/g, "")}`)
      .filter((prefix) => prefix !== "/")
      .flatMap((prefix) => [
        { source: prefix, headers: [referrer, cspHeader(true)] },
        { source: `${prefix}/:path*`, headers: [referrer, cspHeader(true)] },
      ]),
  ];
};
