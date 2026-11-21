// The managed private server: what the hosted app knows about each
// customer's own RXJ server. No server-only imports: these are pure
// functions, tested without a database (src/inngest/__test__/testCoreNodes.ts).
//
// How a server comes to be:
// 1. The customer buys the managed server in Polar. The webhook
//    (src/app/api/webhooks/polar/route.ts) keeps one ManagedServer row per
//    subscription.
// 2. In Settings → Private server they get a one-line install command with
//    an install token (shown once; only its hash is stored).
// 3. They run it on their VPS. public/install.sh installs RXJ there, and
//    self-host/rxj-agent.sh reports in every 15 minutes with the token
//    (POST /api/managed-servers/heartbeat), backs up nightly and updates
//    weekly.

import { createHash, randomBytes } from "crypto";
import z from "zod";

export const INSTALL_TOKEN_PREFIX = "rxjms_";

// Only this hash is stored: a leaked database does not leak usable tokens
export const hashInstallToken = (token: string) =>
  createHash("sha256").update(token, "utf8").digest("hex");

export const generateInstallToken = () => {
  const token = `${INSTALL_TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;

  return {
    token,
    tokenHash: hashInstallToken(token),
    // Enough to recognise a token, not enough to use it
    tokenPrefix: token.slice(0, INSTALL_TOKEN_PREFIX.length + 6),
  };
};

/** The install token of `Authorization: Bearer <token>`, or null. */
export const readInstallToken = (authorization: string | null | undefined) => {
  const header = (authorization || "").trim();
  if (!header.toLowerCase().startsWith("bearer ")) return null;

  const token = header.slice(7).trim();
  return /^rxjms_[0-9a-f]{64}$/.test(token) ? token : null;
};

// --- Polar ---------------------------------------------------------------

type PolarSubscription = {
  id?: unknown;
  status?: unknown;
  product_id?: unknown;
  productId?: unknown;
  product?: { id?: unknown } | null;
  customer?: { email?: unknown } | null;
  user?: { email?: unknown } | null;
};

const text = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;

export type ManagedSubscription = {
  subscriptionId: string;
  productId: string;
  status: string;
  customerEmail: string;
};

/**
 * A subscription event of the managed server product
 * (POLAR_MANAGED_SERVER_PRODUCT_ID), or null for anything else. Every
 * subscription event carries the whole subscription, so the latest event
 * decides the row: applying one twice changes nothing.
 */
export const readManagedSubscription = (
  eventType: unknown,
  data: PolarSubscription | null | undefined,
  env: Record<string, string | undefined> = process.env
): ManagedSubscription | null => {
  if (typeof eventType !== "string" || !eventType.startsWith("subscription.") || !data) {
    return null;
  }

  const productId = text(data.product_id) ?? text(data.productId) ?? text(data.product?.id);
  const wanted = text(env.POLAR_MANAGED_SERVER_PRODUCT_ID);
  if (!productId || !wanted || productId !== wanted) return null;

  const subscriptionId = text(data.id);
  const status = text(data.status)?.toLowerCase();
  const customerEmail = (text(data.customer?.email) ?? text(data.user?.email))?.toLowerCase();

  if (!subscriptionId || !status || !customerEmail) return null;

  return { subscriptionId, productId, status: status.slice(0, 32), customerEmail };
};

// Polar statuses while the customer is still paying. A late payment
// ("past_due") keeps the server looked after while Polar retries.
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"]);

export const isSubscriptionLive = (status: string | null | undefined) =>
  LIVE_STATUSES.has((status || "").toLowerCase());

// --- Heartbeat -------------------------------------------------------------

// What a server sends. Everything is short and plain: the agent builds it
// in bash, and none of it may be a secret.
export const heartbeatSchema = z.object({
  // install-start: the installer checks the token before it does anything;
  // installed: the install finished; heartbeat: every 15 minutes
  event: z.enum(["install-start", "installed", "heartbeat"]),
  domain: z
    .string()
    .max(253)
    .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i)
    .optional(),
  version: z.string().max(100).regex(/^[\w.:@/+-]*$/).optional(),
  lastBackupAt: z.string().datetime({ offset: true }).optional(),
  diskUsedPercent: z.number().int().min(0).max(100).optional(),
  containers: z
    .array(
      z.object({
        name: z.string().regex(/^[a-z0-9._-]{1,64}$/),
        state: z.string().regex(/^[a-z]{1,32}$/),
      })
    )
    .max(20)
    .optional(),
});

export type Heartbeat = z.infer<typeof heartbeatSchema>;

// The agent reports every 15 minutes: two missed reports and it is offline
export const ONLINE_WINDOW_MS = 35 * 60 * 1000;

export type ServerState = "waiting-for-install" | "online" | "offline" | "canceled";

export const getServerState = (
  server: { status: string; installedAt: Date | null; lastSeenAt: Date | null },
  now: Date = new Date()
): ServerState => {
  if (!isSubscriptionLive(server.status)) return "canceled";
  if (!server.installedAt || !server.lastSeenAt) return "waiting-for-install";

  return now.getTime() - server.lastSeenAt.getTime() <= ONLINE_WINDOW_MS ? "online" : "offline";
};

// A nightly backup that is two days old means backups have stopped
export const BACKUP_STALE_MS = 48 * 60 * 60 * 1000;

export const isBackupStale = (lastBackupAt: Date | null, now: Date = new Date()) =>
  !lastBackupAt || now.getTime() - lastBackupAt.getTime() > BACKUP_STALE_MS;

/** Containers the server reported that are not running. */
export const unhealthyContainers = (health: unknown): string[] => {
  const containers = (health as { containers?: unknown } | null)?.containers;
  if (!Array.isArray(containers)) return [];

  return containers
    .filter(
      (entry): entry is { name: string; state: string } =>
        !!entry && typeof entry.name === "string" && entry.state !== "running"
    )
    .map((entry) => entry.name);
};

// --- The install command ------------------------------------------------

const shellSafe = (value: string) => /^[A-Za-z0-9._@:/+-]+$/.test(value);

/**
 * The line the customer pastes on their server. Domain and email are
 * optional: the installer asks for what is missing. Values that are not
 * plain (spaces, quotes...) are left out rather than quoted, so the line
 * can never run anything but the installer.
 */
export const buildInstallCommand = ({
  appUrl,
  token,
  domain,
  email,
}: {
  appUrl: string;
  token: string;
  domain?: string;
  email?: string;
}) => {
  const base = appUrl.replace(/\/+$/, "");
  const args = [`--platform ${base}`, `--token ${token}`];

  const cleanDomain = domain?.trim().toLowerCase();
  if (cleanDomain && shellSafe(cleanDomain) && heartbeatSchema.shape.domain.safeParse(cleanDomain).success) {
    args.push(`--domain ${cleanDomain}`);
  }

  const cleanEmail = email?.trim();
  if (cleanEmail && shellSafe(cleanEmail) && z.string().email().safeParse(cleanEmail).success) {
    args.push(`--email ${cleanEmail}`);
  }

  return `curl -fsSL ${base}/install.sh | sudo bash -s -- ${args.join(" ")}`;
};
