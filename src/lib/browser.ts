import "server-only";

import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { NonRetriableError } from "inngest";
import puppeteer, { type Browser, type BrowserContext, type Page } from "puppeteer-core";
import { BlockedRequestError, assertPublicUrl } from "./ssrf";
import {
  BROWSER_MAX_TIMEOUT_SECONDS,
  type BrowserStep,
} from "./browser-steps";

// The Browser node's connection to a real Chrome, over the Chrome DevTools
// Protocol. RXJ never starts a browser itself (Vercel cannot run one):
//
// - a Browser credential: the WebSocket address of a hosted browser
//   (Browserless, Browserbase, Steel...) with its key, wss:// only
// - otherwise BROWSER_CDP_URL: a browser the server's operator runs, such as
//   the `browser` container of self-host/docker-compose.yml
//
// Every request the page makes (the page itself, redirects, scripts,
// images, XHR) goes through the same SSRF guard as the HTTP Request node, so
// a workflow cannot use the browser to reach private addresses.

/**
 * The address to connect to: a credential's (wss:// only, public host) or
 * the operator's BROWSER_CDP_URL. Throws a clear error when there is none.
 */
export const resolveBrowserEndpoint = async (
  credentialUrl: string | null | undefined,
  env: Record<string, string | undefined> = process.env
): Promise<{ kind: "credential" | "server"; url: string }> => {
  const fromCredential = credentialUrl?.trim();

  if (fromCredential) {
    let url: URL;
    try {
      url = new URL(fromCredential);
    } catch {
      throw new NonRetriableError(
        "Browser node: the credential is not an address. Paste the WebSocket URL your browser service gives you, e.g. wss://production-sfo.browserless.io?token=..."
      );
    }

    if (url.protocol !== "wss:") {
      throw new NonRetriableError(
        "Browser node: the credential's address must start with wss:// (an encrypted connection)"
      );
    }

    // The browser service must be on the internet, not on a private network
    await assertPublicUrl(`https://${url.host}/`);

    return { kind: "credential", url: url.toString() };
  }

  const fromServer = env.BROWSER_CDP_URL?.trim();
  if (fromServer) return { kind: "server", url: fromServer };

  throw new NonRetriableError(
    "Browser node: no browser to use. Choose a Browser credential (a hosted browser such as Browserless, Browserbase or Steel). On your own server, the self-hosted setup has one built in (BROWSER_CDP_URL)."
  );
};

/**
 * The WebSocket address of a browser that is given as http://host:port.
 * Chrome only answers /json/version when the Host header is an IP address,
 * so a name such as `browser` is looked up first.
 */
export const toWebSocketEndpoint = async (
  address: string,
  fetchImpl: typeof fetch = fetch
): Promise<string> => {
  const url = new URL(address);
  if (url.protocol === "ws:" || url.protocol === "wss:") return url.toString();

  const host = url.hostname.replace(/^\[|\]$/g, "");
  const ip = isIP(host) ? host : (await lookup(host)).address;
  const hostPort = `${ip.includes(":") ? `[${ip}]` : ip}:${url.port || "9222"}`;

  const response = await fetchImpl(`http://${hostPort}/json/version`, {
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`the browser answered ${response.status}`);

  const { webSocketDebuggerUrl } = (await response.json()) as { webSocketDebuggerUrl?: string };
  if (!webSocketDebuggerUrl) throw new Error("the browser gave no WebSocket address");

  // Chrome names itself localhost or 127.0.0.1; it is reached at hostPort
  const ws = new URL(webSocketDebuggerUrl);
  ws.host = hostPort;
  return ws.toString();
};

// Addresses inside the page that need no network
const LOCAL_SCHEMES = new Set(["data:", "blob:", "about:"]);

/**
 * Whether the page may make this request. http(s) goes through the SSRF
 * guard; data:, blob: and about: are allowed; everything else (file:,
 * chrome:, ftp:...) is refused. Hosts already checked are remembered for
 * the run.
 */
export const makeRequestGuard = (
  check: (url: string) => Promise<unknown> = assertPublicUrl
) => {
  const verdicts = new Map<string, Promise<boolean>>();

  return async (address: string): Promise<boolean> => {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return false;
    }

    if (LOCAL_SCHEMES.has(url.protocol)) return true;
    if (url.protocol !== "http:" && url.protocol !== "https:") return false;

    const key = `${url.protocol}//${url.host}`;
    let verdict = verdicts.get(key);

    if (!verdict) {
      verdict = check(`${key}/`).then(
        () => true,
        () => false
      );
      verdicts.set(key, verdict);
    }

    return verdict;
  };
};

export type BrowserSession = {
  page: Page;
  // Requests the guard refused, for the error message
  blocked: string[];
  close: () => Promise<void>;
};

/**
 * Connects, and opens one page in a new, empty browser context (no cookies
 * or storage from other runs). close() ends the context and leaves the
 * browser itself running.
 */
export const openBrowserPage = async ({
  endpoint,
  timeoutSeconds,
}: {
  endpoint: { kind: "credential" | "server"; url: string };
  timeoutSeconds: number;
}): Promise<BrowserSession> => {
  let browser: Browser;

  try {
    const browserWSEndpoint =
      endpoint.kind === "server" ? await toWebSocketEndpoint(endpoint.url) : endpoint.url;

    browser = await puppeteer.connect({
      browserWSEndpoint,
      protocolTimeout: (timeoutSeconds + 10) * 1000,
    });
  } catch (error) {
    throw new NonRetriableError(
      `Browser node: could not connect to the browser (${error instanceof Error ? error.message : "unknown error"}). ${
        endpoint.kind === "server"
          ? "Check that the browser container is running (docker compose ps)."
          : "Check the address and key in the Browser credential."
      }`
    );
  }

  let context: BrowserContext | null = null;
  const blocked: string[] = [];

  const close = async () => {
    await context?.close().catch(() => {});
    await browser.disconnect().catch(() => {});
  };

  try {
    // Some hosted browsers allow only their default context
    context = await browser.createBrowserContext().catch(() => null);
    const page = await (context ?? browser).newPage();

    page.setDefaultTimeout(timeoutSeconds * 1000);
    page.setDefaultNavigationTimeout(timeoutSeconds * 1000);

    const allowed = makeRequestGuard();
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      if (request.isInterceptResolutionHandled()) return;

      allowed(request.url())
        .then((ok) => {
          if (ok) return request.continue();
          if (blocked.length < 5) blocked.push(request.url().slice(0, 200));
          return request.abort("blockedbyclient");
        })
        // The page may be closed while a request waits: nothing to do then,
        // and an unhandled rejection would stop the whole server process
        .catch(() => request.abort("blockedbyclient").catch(() => {}));
    });

    // Nothing is downloaded to the browser's disk
    const cdp = await page.createCDPSession().catch(() => null);
    await cdp?.send("Browser.setDownloadBehavior", { behavior: "deny" }).catch(() => {});

    return { page, blocked, close };
  } catch (error) {
    await close();
    throw error;
  }
};

/**
 * Opens an address and waits for it. The address is checked before the
 * browser is asked to go there, so a blocked one has a clear message.
 */
export const gotoGuarded = async (session: BrowserSession, address: string) => {
  try {
    await assertPublicUrl(address);
  } catch (error) {
    if (error instanceof BlockedRequestError) {
      throw new NonRetriableError(`Browser node: ${error.message}`);
    }
    throw error;
  }

  const blockedError = () =>
    new NonRetriableError(
      `Browser node: the page was blocked: private and local addresses cannot be opened (${session.blocked[0]})`
    );

  try {
    const response = await session.page.goto(address, { waitUntil: "networkidle2" });
    if (!response && session.blocked.length > 0) throw blockedError();
    return response;
  } catch (error) {
    // A redirect to a private address is refused by the request guard
    if (session.blocked.length > 0 && /ERR_BLOCKED_BY_CLIENT/.test(String(error))) {
      throw blockedError();
    }
    throw error;
  }
};

/**
 * Runs the steps of "Run Steps" in order. A step that fails stops the node
 * with the step's number, so the user knows which one to fix.
 */
export const runBrowserSteps = async (session: BrowserSession, steps: BrowserStep[]) => {
  const { page } = session;

  for (const [index, step] of steps.entries()) {
    const where = `step ${index + 1} (${step.action})`;

    try {
      switch (step.action) {
        case "goto":
          await gotoGuarded(session, step.url);
          break;
        case "click":
          await page.waitForSelector(step.selector, { visible: true });
          await page.click(step.selector);
          break;
        case "type":
          await page.waitForSelector(step.selector, { visible: true });
          await page.type(step.selector, step.text);
          break;
        case "select":
          await page.waitForSelector(step.selector);
          await page.select(step.selector, step.value);
          break;
        case "press":
          await page.keyboard.press(step.key as Parameters<typeof page.keyboard.press>[0]);
          break;
        case "waitFor":
          await page.waitForSelector(step.selector, { visible: true });
          break;
        case "waitForNavigation":
          await page.waitForNavigation({ waitUntil: "networkidle2" });
          break;
        case "wait":
          await new Promise((resolve) => setTimeout(resolve, step.ms));
          break;
        case "scroll":
          // A string, not a function: the browser runs it as it is written
          await page.evaluate("window.scrollTo(0, document.body.scrollHeight)");
          break;
      }
    } catch (error) {
      if (error instanceof NonRetriableError) throw error;
      throw new NonRetriableError(
        `Browser node: ${where} failed: ${error instanceof Error ? error.message.split("\n")[0] : "unknown error"}`
      );
    }
  }
};

export type PageElement = {
  selector: string;
  tag: string;
  type?: string;
  text?: string;
  name?: string;
  placeholder?: string;
  href?: string;
};

export const MAX_PAGE_ELEMENTS = 60;

// Runs in the page. Kept as a string, not a function, so no build tool can
// add helpers to it that the page does not have. Lists the visible links,
// buttons and form fields with a CSS selector for each: an AI Agent reads
// this list, then writes Run Steps with these selectors.
const LIST_ELEMENTS_SCRIPT = `(() => {
  const max = ${MAX_PAGE_ELEMENTS};
  const clip = (value, length) => (value || "").replace(/\\s+/g, " ").trim().slice(0, length);
  const selectorOf = (element) => {
    if (element.id) return "#" + CSS.escape(element.id);
    const tag = element.tagName.toLowerCase();
    const name = element.getAttribute("name");
    if (name) {
      const byName = tag + '[name="' + name.replace(/["\\\\]/g, "\\\\$&") + '"]';
      if (document.querySelectorAll(byName).length === 1) return byName;
    }
    const parts = [];
    let current = element;
    while (current && current.nodeType === 1 && current !== document.body) {
      let index = 1;
      let sibling = current;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName === current.tagName) index++;
      }
      parts.unshift(current.tagName.toLowerCase() + ":nth-of-type(" + index + ")");
      current = current.parentElement;
    }
    return "body > " + parts.join(" > ");
  };
  const visible = (element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return box.width > 0 && box.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  };
  const found = [];
  for (const element of document.querySelectorAll('a[href], button, input, select, textarea, [role="button"], [role="link"]')) {
    if (found.length >= max) break;
    if (element.type === "hidden" || element.disabled || !visible(element)) continue;
    const entry = { selector: selectorOf(element), tag: element.tagName.toLowerCase() };
    if (element.type) entry.type = clip(element.type, 20);
    const text = clip(element.innerText || element.value || element.getAttribute("aria-label") || element.title, 80);
    if (text) entry.text = text;
    if (element.name) entry.name = clip(element.name, 60);
    if (element.placeholder) entry.placeholder = clip(element.placeholder, 60);
    if (element.tagName === "A") entry.href = clip(element.href, 200);
    found.push(entry);
  }
  return found;
})()`;

/**
 * The visible links, buttons and form fields of the page, with a selector
 * for each (at most 60). Passwords' values are never read: only the type.
 */
export const listPageElements = async (session: BrowserSession): Promise<PageElement[]> => {
  const elements = (await session.page.evaluate(LIST_ELEMENTS_SCRIPT)) as PageElement[];

  return Array.isArray(elements)
    ? elements.map((element) =>
        element.type === "password" ? { ...element, text: undefined } : element
      )
    : [];
};

export { BROWSER_MAX_TIMEOUT_SECONDS };
