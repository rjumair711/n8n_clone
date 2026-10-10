import { parseAddress, type ParsedAddress } from "./ip-address";

// PRIVATE_NETWORK_ALLOWLIST: the private addresses workflows may reach. The
// SSRF guard refuses every private or local address; a self-hosted server
// lists the few it needs here instead of opening its whole network with
// ALLOW_PRIVATE_NETWORK_REQUESTS=true.
//
// Comma-separated entries:
//
//   127.0.0.1:11434     one address, one port
//   10.0.0.5            one address, any port
//   10.0.0.0/24         a range (CIDR), any port
//   ollama.lan:11434    a host name, one port
//   db.internal         a host name, any port
//   [::1]:11434         IPv6 with a port, in brackets
//   fd00:1234::/64      an IPv6 range
//
// A host name entry allows that name, whatever private address it resolves
// to. Addresses and ranges allow those addresses, whatever name was used.
//
// Pure functions, no server imports, so the matching can be tested.

type Env = Record<string, string | undefined>;

export type AllowlistEntry =
  // A single address is a range with a full-length prefix
  | { kind: "range"; address: ParsedAddress; prefix: number; port?: number; text: string }
  | { kind: "host"; name: string; port?: number; text: string };

export type Allowlist = {
  entries: AllowlistEntry[];
  // What could not be read. These allow nothing.
  invalid: string[];
};

const HOSTNAME =
  /^[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?(\.[a-z0-9_]([a-z0-9_-]*[a-z0-9_])?)*$/;

const parsePort = (text: string): number | null => {
  if (!/^\d{1,5}$/.test(text)) return null;

  const port = Number(text);

  return port >= 1 && port <= 65535 ? port : null;
};

const parseEntry = (raw: string): AllowlistEntry | null => {
  const text = raw.trim().toLowerCase();
  if (!text) return null;

  // A range: address/prefix
  if (text.includes("/")) {
    const [base, prefixText, ...extra] = text.split("/");
    const address = parseAddress(base);

    if (!address || extra.length > 0 || !/^\d{1,3}$/.test(prefixText)) return null;

    const prefix = Number(prefixText);
    if (prefix > address.bytes.length * 8) return null;

    return { kind: "range", address, prefix, text };
  }

  let host = text;
  let port: number | undefined;

  const bracketed = /^\[([^\]]+)\](?::(.*))?$/.exec(text);

  if (bracketed) {
    // [::1] or [::1]:11434
    host = bracketed[1];

    if (bracketed[2] !== undefined) {
      const parsed = parsePort(bracketed[2]);
      if (parsed === null) return null;
      port = parsed;
    }
  } else if (text.split(":").length === 2) {
    // host:port. More than one colon is a bare IPv6 address.
    const [name, portText] = text.split(":");
    const parsed = parsePort(portText);
    if (parsed === null) return null;

    host = name;
    port = parsed;
  }

  // A bracket that was not part of a whole [address]
  if (/[[\]]/.test(host)) return null;

  const address = parseAddress(host);

  if (address) {
    return {
      kind: "range",
      address,
      prefix: address.bytes.length * 8,
      ...(port !== undefined ? { port } : {}),
      text,
    };
  }

  // Something that looks like an address but is not one ("10.0.0.300")
  // must not turn into a host name
  if (bracketed || host.includes(":") || /^[\d.]+$/.test(host) || !HOSTNAME.test(host)) {
    return null;
  }

  return { kind: "host", name: host, ...(port !== undefined ? { port } : {}), text };
};

export const parseAllowlist = (value: string | undefined | null): Allowlist => {
  const entries: AllowlistEntry[] = [];
  const invalid: string[] = [];

  for (const raw of (value ?? "").split(",")) {
    if (!raw.trim()) continue;

    const entry = parseEntry(raw);
    if (entry) entries.push(entry);
    else invalid.push(raw.trim());
  }

  return { entries, invalid };
};

let cached: { value: string | undefined; allowlist: Allowlist } | undefined;

// The allowlist of the environment, read again when the variable changes
export const getPrivateNetworkAllowlist = (env: Env = process.env): Allowlist => {
  const value = env.PRIVATE_NETWORK_ALLOWLIST;

  if (!cached || cached.value !== value) {
    cached = { value, allowlist: parseAllowlist(value) };
  }

  return cached.allowlist;
};

const inRange = (address: ParsedAddress, range: ParsedAddress, prefix: number) => {
  if (address.version !== range.version) return false;

  for (let bit = 0; bit < prefix; bit += 8) {
    const index = bit / 8;
    const bits = Math.min(prefix - bit, 8);
    const mask = (0xff << (8 - bits)) & 0xff;

    if ((address.bytes[index] & mask) !== (range.bytes[index] & mask)) return false;
  }

  return true;
};

const portMatches = (entry: AllowlistEntry, port: number | undefined) =>
  entry.port === undefined || entry.port === port;

/**
 * Whether the name a request was made to is on the list. Such a name may
 * resolve to private addresses.
 */
export const isAllowedHostname = (
  allowlist: Allowlist,
  hostname: string,
  port?: number
): boolean => {
  const name = hostname.trim().toLowerCase().replace(/\.$/, "");

  return allowlist.entries.some(
    (entry) => entry.kind === "host" && entry.name === name && portMatches(entry, port)
  );
};

/**
 * Whether a private address is on the list, as itself or inside a range.
 * An entry with a port only allows that port; a request whose port is not
 * known only matches entries without one.
 */
export const isAllowedAddress = (
  allowlist: Allowlist,
  address: string,
  port?: number
): boolean => {
  const parsed = parseAddress(address);
  if (!parsed) return false;

  return allowlist.entries.some(
    (entry) =>
      entry.kind === "range" &&
      portMatches(entry, port) &&
      inRange(parsed, entry.address, entry.prefix)
  );
};

/**
 * What to log at startup about the private network settings: a nudge away
 * from allowing everything, and entries of the allowlist that are ignored.
 */
export const getPrivateNetworkWarnings = (env: Env = process.env): string[] => {
  const warnings: string[] = [];
  const { entries, invalid } = parseAllowlist(env.PRIVATE_NETWORK_ALLOWLIST);

  if (env.ALLOW_PRIVATE_NETWORK_REQUESTS === "true") {
    warnings.push(
      "[RXJ] ALLOW_PRIVATE_NETWORK_REQUESTS=true lets workflows reach every private and local address this server can, including cloud metadata and internal services. Prefer PRIVATE_NETWORK_ALLOWLIST with only the addresses that are needed, for example PRIVATE_NETWORK_ALLOWLIST=127.0.0.1:11434,10.0.0.0/24" +
        (entries.length > 0
          ? ". PRIVATE_NETWORK_ALLOWLIST is set but has no effect while everything is allowed."
          : ".")
    );
  }

  if (invalid.length > 0) {
    warnings.push(
      `[RXJ] PRIVATE_NETWORK_ALLOWLIST has entries that could not be read and are ignored: ${invalid.join(", ")}. Use a host, host:port or CIDR range, for example 127.0.0.1:11434 or 10.0.0.0/24.`
    );
  }

  return warnings;
};
