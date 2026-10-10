// Reading IP addresses. Pure functions shared by the SSRF guard and the
// private network allowlist.

// The four octets of a dotted IPv4 address
export const parseIPv4 = (address: string): number[] | null => {
  const parts = address.split(".");
  if (parts.length !== 4) return null;

  const octets = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : -1));

  return octets.every((octet) => octet >= 0 && octet <= 255) ? octets : null;
};

// Expands an IPv6 address to its eight 16-bit groups
export const parseIPv6 = (address: string): number[] | null => {
  let text = address.split("%")[0].toLowerCase();

  // An embedded IPv4 tail (::ffff:1.2.3.4) becomes two groups
  const tail = text.slice(text.lastIndexOf(":") + 1);
  if (tail.includes(".")) {
    const octets = parseIPv4(tail);
    if (!octets) return null;

    text =
      text.slice(0, text.lastIndexOf(":") + 1) +
      ((octets[0] << 8) | octets[1]).toString(16) +
      ":" +
      ((octets[2] << 8) | octets[3]).toString(16);
  }

  const halves = text.split("::");
  if (halves.length > 2) return null;

  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];

  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 0 : missing !== 0) return null;

  const groups = [...head, ...Array(Math.max(missing, 0)).fill("0"), ...rest].map(
    (group) => (/^[0-9a-f]{1,4}$/.test(group) ? parseInt(group, 16) : -1)
  );

  return groups.length === 8 && groups.every((group) => group >= 0)
    ? groups
    : null;
};

export type ParsedAddress = { version: 4 | 6; bytes: number[] };

/**
 * An address as bytes: 4 for IPv4, 16 for IPv6. An IPv4 address written
 * inside IPv6 (::ffff:10.0.0.5) is the IPv4 address it stands for, so it is
 * judged the same way whichever form a DNS answer uses.
 */
export const parseAddress = (address: string): ParsedAddress | null => {
  const text = address.trim().replace(/^\[|\]$/g, "");

  const v4 = parseIPv4(text);
  if (v4) return { version: 4, bytes: v4 };

  const groups = text.includes(":") ? parseIPv6(text) : null;
  if (!groups) return null;

  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return {
      version: 4,
      bytes: [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff],
    };
  }

  return {
    version: 6,
    bytes: groups.flatMap((group) => [group >> 8, group & 0xff]),
  };
};
