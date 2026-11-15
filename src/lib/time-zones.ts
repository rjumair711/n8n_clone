// A workflow's time zone: which clock its Schedule Triggers read. Stored as
// an IANA name ("Asia/Karachi"); none means UTC, as schedules always ran.
// No server-only imports: the editor's settings dialog uses these too.

export const DEFAULT_TIME_ZONE = "UTC";

// Shown first in the picker: where most RXJ users are
export const COMMON_TIME_ZONES = [
  "Asia/Karachi",
  "Asia/Riyadh",
  "Asia/Dubai",
  "Asia/Qatar",
  "Asia/Kuwait",
  "Asia/Bahrain",
  "Asia/Muscat",
  "Africa/Cairo",
  "Asia/Kolkata",
  "Asia/Dhaka",
  "Europe/Istanbul",
  "Europe/London",
  "America/New_York",
  "UTC",
] as const;

/** Whether the runtime knows the zone ("Asia/Karachi" yes, "PKT" no). */
export const isValidTimeZone = (zone: unknown): zone is string => {
  if (typeof zone !== "string" || !zone.trim() || zone.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    // Abbreviations such as "EST" are accepted by some runtimes but are not
    // zones; every IANA name but UTC/GMT has a slash
    return zone === "UTC" || zone === "GMT" || zone.includes("/");
  } catch {
    return false;
  }
};

/** The zone to run in: the stored one if it is still valid, else UTC. */
export const effectiveTimeZone = (zone: string | null | undefined): string =>
  isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE;

/** Every zone the runtime knows, common ones first. */
export const listTimeZones = (): string[] => {
  let all: string[] = [];
  try {
    all = (Intl as unknown as { supportedValuesOf?: (key: string) => string[] }).supportedValuesOf?.("timeZone") ?? [];
  } catch {
    all = [];
  }
  const common = COMMON_TIME_ZONES as readonly string[];
  return [...common, ...all.filter((zone) => !common.includes(zone))];
};

/** "UTC+05:00" for a zone at a moment, for the picker's labels. */
export const formatUtcOffset = (zone: string, at: Date = new Date()): string => {
  try {
    const part = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value;
    if (!part || part === "GMT") return "UTC+00:00";
    return part.replace("GMT", "UTC");
  } catch {
    return "";
  }
};
