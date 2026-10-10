import { lookup as dnsLookup } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch } from "undici";
import { parseIPv4, parseIPv6 } from "./ip-address";
import {
  getPrivateNetworkAllowlist,
  isAllowedAddress,
  isAllowedHostname,
} from "./private-network-allowlist";

/**
 * Workflows fetch URLs chosen by users. Without a guard that lets anyone
 * reach the server's own network: cloud metadata (169.254.169.254), the
 * database, the Inngest dev server and so on. Requests are only allowed to
 * public addresses, plus the private ones listed in
 * PRIVATE_NETWORK_ALLOWLIST (self-hosted setups that need to call services
 * on their own LAN, e.g. Ollama).
 *
 * ALLOW_PRIVATE_NETWORK_REQUESTS=true still switches the guard off for
 * every private address. It is kept for existing setups; the allowlist is
 * the safer way and a warning at startup says so.
 */
export const privateNetworkAllowed = () =>
  process.env.ALLOW_PRIVATE_NETWORK_REQUESTS === "true";

// Where a request is going, as far as it is known
type Target = { hostname: string; port?: number };

const hostOf = (hostname: string) => hostname.replace(/^\[|\]$/g, "");

const portOf = (url: URL): number =>
  url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;

/**
 * Whether an address the request would connect to is refused: private or
 * local, and not on the allowlist as itself, inside a listed range, or
 * through the listed name the request was made to.
 */
const isRefusedAddress = (address: string, target: Target): boolean => {
  if (!isBlockedAddress(address)) return false;

  const allowlist = getPrivateNetworkAllowlist();

  return !(
    isAllowedAddress(allowlist, address, target.port) ||
    isAllowedHostname(allowlist, target.hostname, target.port)
  );
};

/**
 * For code that resolves a name itself and connects to the address (SSH):
 * whether that address may not be connected to.
 */
export const isRefusedPrivateAddress = (
  address: string,
  hostname: string,
  port?: number
): boolean =>
  !privateNetworkAllowed() && isRefusedAddress(address, { hostname, port });

/**
 * Whether a host can be refused without DNS: an IP literal that is refused,
 * or an obviously local name ("localhost", "*.internal").
 *
 * With an allowlist a local name is let through to the lookup: it may be
 * listed itself, or resolve to a listed address ("localhost" for
 * 127.0.0.1:11434). The lookup then refuses every address that is not.
 */
const isRefusedHost = (target: Target): boolean => {
  const host = hostOf(target.hostname);

  if (isIP(host)) return isRefusedAddress(host, { ...target, hostname: host });

  return (
    BLOCKED_HOSTNAMES.test(host) &&
    getPrivateNetworkAllowlist().entries.length === 0
  );
};

export class BlockedRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedRequestError";
  }
}

const isBlockedIPv4 = ([a, b, c]: number[]): boolean =>
  a === 0 || // "this" network
  a === 10 || // private
  a === 127 || // loopback
  (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
  (a === 169 && b === 254) || // link-local, cloud metadata
  (a === 172 && b >= 16 && b <= 31) || // private
  (a === 192 && b === 168) || // private
  (a === 192 && b === 0 && c === 0) || // IETF protocol assignments
  (a === 192 && b === 0 && c === 2) || // documentation
  (a === 198 && (b === 18 || b === 19)) || // benchmarking
  (a === 198 && b === 51 && c === 100) || // documentation
  (a === 203 && b === 0 && c === 113) || // documentation
  a >= 224; // multicast, reserved, broadcast

const isBlockedIPv6 = (groups: number[]): boolean => {
  const [first, second] = groups;
  const leadingZeros = groups.slice(0, 5).every((group) => group === 0);

  // IPv4-mapped (::ffff:a.b.c.d) and IPv4-compatible (::a.b.c.d): judge the
  // embedded IPv4 address. This also covers :: and ::1.
  if (leadingZeros && (groups[5] === 0xffff || groups[5] === 0)) {
    return isBlockedIPv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]);
  }

  // NAT64 (64:ff9b::/96) also embeds an IPv4 address
  if (first === 0x64 && second === 0xff9b) {
    return isBlockedIPv4([
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ]);
  }

  return (
    (first & 0xfe00) === 0xfc00 || // unique local fc00::/7
    (first & 0xffc0) === 0xfe80 || // link-local fe80::/10
    (first & 0xffc0) === 0xfec0 || // site-local (deprecated)
    (first & 0xff00) === 0xff00 || // multicast
    (first === 0x2001 && second === 0x0db8) // documentation
  );
};

/**
 * True for addresses that are not on the public internet. Anything that does
 * not parse as an IP address is treated as blocked.
 */
export const isBlockedAddress = (address: string): boolean => {
  const v4 = parseIPv4(address);
  if (v4) return isBlockedIPv4(v4);

  const v6 = parseIPv6(address);
  if (v6) return isBlockedIPv6(v6);

  return true;
};

const BLOCKED_HOSTNAMES = /(^|\.)(localhost|local|internal|localdomain)$/i;

/**
 * Checks the parts of a URL that can be judged without DNS: the scheme and
 * hosts that are IP literals or obviously local names.
 */
export const parsePublicUrl = (input: string): URL => {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new BlockedRequestError(`"${input}" is not a valid URL`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedRequestError(
      `Only http and https URLs are allowed (got ${url.protocol})`
    );
  }

  if (privateNetworkAllowed()) return url;

  // WHATWG URL already normalises forms like 0x7f.1 or 2130706433 to dotted
  // IPv4, and wraps IPv6 literals in brackets
  const host = hostOf(url.hostname);

  if (isRefusedHost({ hostname: host, port: portOf(url) })) {
    throw new BlockedRequestError(
      `Requests to private or local addresses are not allowed (${host})`
    );
  }

  return url;
};

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address?: string | { address: string; family: number }[],
  family?: number
) => void;

// Runs when the socket connects, so the address that was checked is the
// address that is used (a DNS answer cannot change in between). `port` is
// the port the connection is for, when it is known: allowlist entries with
// a port only allow that one.
const guardedLookup = (
  hostname: string,
  options: Record<string, unknown>,
  callback: LookupCallback,
  port?: number
) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error);

    const list = addresses as { address: string; family: number }[];

    // Every address of the answer has to pass: the connection may use any
    const blocked = privateNetworkAllowed()
      ? undefined
      : list.find((entry) => isRefusedAddress(entry.address, { hostname, port }));

    if (blocked || list.length === 0) {
      return callback(
        new BlockedRequestError(
          `Requests to private or local addresses are not allowed (${hostname})`
        )
      );
    }

    if (options.all) return callback(null, list);

    callback(null, list[0].address, list[0].family);
  });
};

// The lookup of a connection is not told its port, so there is an agent per
// port that the allowlist names and one for every other port. Their number
// is bounded by the allowlist, not by what users request.
const ANY_OTHER_PORT = 0;
const agents = new Map<number, Agent>();

const getAgent = (port: number) => {
  const listed = getPrivateNetworkAllowlist().entries.some(
    (entry) => entry.port === port
  );
  const key = listed ? port : ANY_OTHER_PORT;

  let agent = agents.get(key);

  if (!agent) {
    agent = new Agent({
      connect: {
        lookup: ((
          hostname: string,
          options: Record<string, unknown>,
          callback: LookupCallback
        ) =>
          guardedLookup(
            hostname,
            options,
            callback,
            // A port no entry names matches the same entries as no port
            key === ANY_OTHER_PORT ? undefined : key
          )) as never,
      },
    });
    agents.set(key, agent);
  }

  return agent;
};

/**
 * Resolves the host and rejects URLs that point into a private network.
 * For calls made with another HTTP client; `safeFetch` is stricter because
 * it checks at connection time and on every redirect.
 */
export const assertPublicUrl = async (input: string): Promise<URL> => {
  const url = parsePublicUrl(input);
  const host = hostOf(url.hostname);

  if (privateNetworkAllowed() || isIP(host)) return url;

  await new Promise<void>((resolve, reject) => {
    guardedLookup(
      host,
      {},
      (error) => (error ? reject(error) : resolve()),
      portOf(url)
    );
  });

  return url;
};

const MAX_REDIRECTS = 5;

/**
 * `fetch` for user-supplied URLs. Redirects are followed by hand so every hop
 * goes through the same checks as the first URL.
 */
export const safeFetch = async (
  input: string | URL,
  init: RequestInit = {}
): Promise<Response> => {
  let url = parsePublicUrl(String(input));
  let method = (init.method || "GET").toUpperCase();
  let body = init.body;
  const headers = new Headers(init.headers);

  for (let hop = 0; ; hop++) {
    const response = (await undiciFetch(url, {
      ...(init as Record<string, unknown>),
      method,
      headers: Object.fromEntries(headers),
      body: body as never,
      redirect: "manual",
      dispatcher: getAgent(portOf(url)),
    })) as unknown as Response;

    const location = response.headers.get("location");

    if (response.status < 300 || response.status >= 400 || !location) {
      return response;
    }

    if (init.redirect === "manual") return response;

    if (init.redirect === "error" || hop >= MAX_REDIRECTS) {
      throw new BlockedRequestError(
        init.redirect === "error"
          ? "The request was redirected"
          : `Too many redirects (more than ${MAX_REDIRECTS})`
      );
    }

    const next = parsePublicUrl(new URL(location, url).toString());

    // Same rules browsers apply: 303 always becomes GET, 301/302 only for POST
    if (
      response.status === 303 ||
      ((response.status === 301 || response.status === 302) && method === "POST")
    ) {
      method = "GET";
      body = undefined;
      headers.delete("content-type");
      headers.delete("content-length");
    }

    // Never forward credentials to a different site
    if (next.origin !== url.origin) {
      headers.delete("authorization");
      headers.delete("cookie");
    }

    url = next;
  }
};

/**
 * For connections that are not HTTP (database nodes): rejects a host name
 * or address that points into a private network. Pass the port when it is
 * known: without it only allowlist entries that name no port apply.
 */
export const assertPublicHost = async (
  hostname: string,
  port?: number
): Promise<void> => {
  if (privateNetworkAllowed()) return;

  const host = hostOf(hostname);

  if (isRefusedHost({ hostname: host, port })) {
    throw new BlockedRequestError(
      `Connections to private or local addresses are not allowed (${host})`
    );
  }

  if (isIP(host)) return;

  await new Promise<void>((resolve, reject) => {
    guardedLookup(
      host,
      {},
      (error) =>
        error
          ? reject(
              error instanceof BlockedRequestError
                ? new BlockedRequestError(
                    `Connections to private or local addresses are not allowed (${host})`
                  )
                : error
            )
          : resolve(),
      port
    );
  });
};
