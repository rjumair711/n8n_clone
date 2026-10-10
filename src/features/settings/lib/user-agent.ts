// A short name for the browser and system behind a session, from its
// User-Agent header. Pure, so it can be tested.

// Order matters: Edge and Opera also say "Chrome", Chrome also says "Safari"
const BROWSERS: [RegExp, string][] = [
  [/\bEdg(?:e|A|iOS)?\//, "Edge"],
  [/\bOPR\/|\bOpera\b/, "Opera"],
  [/\bSamsungBrowser\//, "Samsung Internet"],
  [/\bFirefox\/|\bFxiOS\//, "Firefox"],
  [/\bChrome\/|\bCriOS\//, "Chrome"],
  [/\bSafari\//, "Safari"],
];

// iPhone and iPad also say "Mac OS X", Android also says "Linux"
const SYSTEMS: [RegExp, string][] = [
  [/\biPhone\b/, "iPhone"],
  [/\biPad\b/, "iPad"],
  [/\bAndroid\b/, "Android"],
  [/\bWindows\b/, "Windows"],
  [/\bMac OS X\b|\bMacintosh\b/, "macOS"],
  [/\bCrOS\b/, "ChromeOS"],
  [/\bLinux\b/, "Linux"],
];

const firstMatch = (table: [RegExp, string][], text: string) =>
  table.find(([pattern]) => pattern.test(text))?.[1];

/**
 * "Chrome on Windows", "Safari on iPhone"... or "Unknown device" when the
 * header is missing or says nothing recognisable (a script, an API client).
 */
export const describeUserAgent = (userAgent?: string | null): string => {
  const text = (userAgent || "").trim();
  if (!text) return "Unknown device";

  const browser = firstMatch(BROWSERS, text);
  const system = firstMatch(SYSTEMS, text);

  if (browser && system) return `${browser} on ${system}`;

  return browser || system || "Unknown device";
};
