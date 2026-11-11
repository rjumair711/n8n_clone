// The Browser node's "Run Steps": what the user writes, checked before a
// browser is opened. Pure, so it can be tested without one.

export const BROWSER_DEFAULT_TIMEOUT_SECONDS = 30;
export const BROWSER_MAX_TIMEOUT_SECONDS = 120;
export const BROWSER_MAX_STEPS = 30;
// One "wait" step
export const BROWSER_MAX_WAIT_MS = 10_000;

export type BrowserStep =
  | { action: "goto"; url: string }
  | { action: "click"; selector: string }
  | { action: "type"; selector: string; text: string }
  | { action: "select"; selector: string; value: string }
  | { action: "press"; key: string }
  | { action: "waitFor"; selector: string }
  | { action: "waitForNavigation" }
  | { action: "wait"; ms: number }
  | { action: "scroll" };

export const BROWSER_STEP_ACTIONS = [
  "goto",
  "click",
  "type",
  "select",
  "press",
  "waitFor",
  "waitForNavigation",
  "wait",
  "scroll",
] as const;

// Keys "press" may send: the ones forms need, nothing that opens browser UI
const ALLOWED_KEYS = new Set([
  "Enter",
  "Tab",
  "Escape",
  "Backspace",
  "Delete",
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "PageUp",
  "PageDown",
  "Home",
  "End",
]);

export class BrowserStepError extends Error {}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const requireText = (step: Record<string, unknown>, field: string, where: string, max = 2000) => {
  const value = step[field];

  if (typeof value !== "string" || !value.trim()) {
    throw new BrowserStepError(`${where}: "${field}" is missing`);
  }
  if (value.length > max) {
    throw new BrowserStepError(`${where}: "${field}" is longer than ${max} characters`);
  }

  return value;
};

/**
 * Reads the steps: a JSON list such as
 * [{"action":"type","selector":"#email","text":"me@x.com"},{"action":"click","selector":"button[type=submit]"}]
 */
export const parseBrowserSteps = (
  input: string,
  // Fills in {{...}} in each text value, after the JSON is read, so a value
  // with quotes in it cannot break the list
  render: (text: string) => string = (text) => text
): BrowserStep[] => {
  const source = input.trim();
  if (!source) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    throw new BrowserStepError(
      'Steps must be a JSON list, e.g. [{"action":"click","selector":"#accept"}]'
    );
  }

  if (!Array.isArray(parsed)) {
    throw new BrowserStepError("Steps must be a JSON list ([ ... ])");
  }
  if (parsed.length > BROWSER_MAX_STEPS) {
    throw new BrowserStepError(`At most ${BROWSER_MAX_STEPS} steps`);
  }

  return parsed.map((entry, index): BrowserStep => {
    const where = `Step ${index + 1}`;
    if (!isRecord(entry)) throw new BrowserStepError(`${where} is not an object`);

    const raw: Record<string, unknown> = Object.fromEntries(
      Object.entries(entry).map(([key, value]) => [
        key,
        typeof value === "string" && key !== "action" ? render(value) : value,
      ])
    );
    const action = raw.action;

    switch (action) {
      case "goto": {
        const url = requireText(raw, "url", where).trim();
        if (!/^https?:\/\//i.test(url)) {
          throw new BrowserStepError(`${where}: "url" must start with http:// or https://`);
        }
        return { action, url };
      }
      case "click":
      case "waitFor":
        return { action, selector: requireText(raw, "selector", where, 500) };
      case "type":
        return {
          action,
          selector: requireText(raw, "selector", where, 500),
          // Text may be a single space or anything a form takes
          text: typeof raw.text === "string" ? raw.text.slice(0, 5000) : String(raw.text ?? ""),
        };
      case "select":
        return {
          action,
          selector: requireText(raw, "selector", where, 500),
          value: requireText(raw, "value", where, 500),
        };
      case "press": {
        const key = requireText(raw, "key", where, 40);
        if (!ALLOWED_KEYS.has(key)) {
          throw new BrowserStepError(
            `${where}: key "${key}" is not allowed. Use one of: ${[...ALLOWED_KEYS].join(", ")}`
          );
        }
        return { action, key };
      }
      case "wait": {
        const ms = Math.floor(Number(raw.ms));
        if (!Number.isFinite(ms) || ms < 0) {
          throw new BrowserStepError(`${where}: "ms" must be a number of milliseconds`);
        }
        return { action, ms: Math.min(ms, BROWSER_MAX_WAIT_MS) };
      }
      case "waitForNavigation":
      case "scroll":
        return { action };
      default:
        throw new BrowserStepError(
          `${where}: unknown action "${String(action)}". Use one of: ${BROWSER_STEP_ACTIONS.join(", ")}`
        );
    }
  });
};

/** The node's Timeout (seconds) field: 5 to 120, default 30. */
export const resolveBrowserTimeout = (value: unknown): number => {
  const seconds = Math.floor(Number(String(value ?? "").trim()));

  if (!Number.isFinite(seconds) || seconds <= 0) return BROWSER_DEFAULT_TIMEOUT_SECONDS;

  return Math.min(Math.max(seconds, 5), BROWSER_MAX_TIMEOUT_SECONDS);
};
