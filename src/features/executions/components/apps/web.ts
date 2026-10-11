import { NonRetriableError } from "inngest";
import ky from "ky";
import type { NodeExecutor } from "@/features/executions/types";
import { BlockedRequestError, assertPublicUrl, safeFetch } from "@/lib/ssrf";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret, toIntegrationError } from "../../lib/integration";
import {
  extractReadableContent,
  limitText,
  resolveMaxCharacters,
} from "../../lib/readability";

// Web Search and Read Web Page. Both are made to be AI Agent tools as well
// as steps: they only read, and what they return is cut to a size the node
// sets, because every character of it is paid for again as model input.

type WebData = {
  variableName?: string;
  credentialId?: string;
  // Web Search: "tavily" | "brave" | "searxng"
  // Read Web Page: "builtin" | "jina" | "firecrawl"
  operation?: string;
  [key: string]: string | undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value : "");

const cleanLine = (value: unknown) => text(value).replace(/\s+/g, " ").trim();

// =========================================================================
// WEB SEARCH
// =========================================================================
export const SEARCH_PROVIDERS = [
  { value: "tavily", label: "Tavily" },
  { value: "brave", label: "Brave Search" },
  { value: "searxng", label: "SearXNG (self-hosted)" },
] as const;

export const SEARCH_DEFAULT_RESULTS = 5;
export const SEARCH_MAX_RESULTS = 20;
// Characters of each result's snippet
export const SEARCH_DEFAULT_SNIPPET = 500;
export const SEARCH_MAX_SNIPPET = 5000;

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export const resolveMaxResults = (value: unknown): number => {
  const count = Math.floor(Number(String(value ?? "").trim()));

  if (!Number.isFinite(count) || count < 1) return SEARCH_DEFAULT_RESULTS;

  return Math.min(count, SEARCH_MAX_RESULTS);
};

/**
 * What a provider answered, as the same list for all three: results that
 * have a web address, at most `maxResults`, each snippet cut to
 * `maxSnippet` characters.
 */
export const normalizeSearchResults = (
  provider: string,
  body: unknown,
  { maxResults, maxSnippet }: { maxResults: number; maxSnippet: number }
): SearchResult[] => {
  const root = isRecord(body) ? body : {};

  // Brave nests them under "web"; Tavily and SearXNG have them at the top
  const list =
    provider === "brave"
      ? (isRecord(root.web) ? root.web.results : undefined)
      : root.results;

  const results: SearchResult[] = [];

  for (const entry of Array.isArray(list) ? list : []) {
    if (!isRecord(entry)) continue;

    const url = text(entry.url).trim();
    if (!/^https?:\/\//i.test(url)) continue;

    const snippet = cleanLine(
      provider === "brave"
        ? // Brave marks the matched words with <strong>
          text(entry.description).replace(/<\/?[a-z][^>]*>/gi, "")
        : entry.content
    );

    results.push({
      title: cleanLine(entry.title).slice(0, 300),
      url: url.slice(0, 2000),
      snippet:
        snippet.length > maxSnippet ? `${snippet.slice(0, maxSnippet).trimEnd()}...` : snippet,
    });

    if (results.length >= maxResults) break;
  }

  return results;
};

const SEARCH_CREDENTIALS: Record<string, string> = {
  tavily: "Tavily",
  brave: "Brave Search",
};

/**
 * Searches the web with Tavily, Brave Search or your own SearXNG server
 * and returns titles, links and snippets.
 */
export const webSearchExecutor: NodeExecutor<WebData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "search";
  const provider = data.operation || "tavily";

  if (!SEARCH_PROVIDERS.some((entry) => entry.value === provider)) {
    throw new NonRetriableError(`Web Search node: Unsupported provider "${provider}"`);
  }

  const query = renderTemplate(data.query, context).replace(/\s+/g, " ").trim().slice(0, 400);
  if (!query) {
    throw new NonRetriableError("Web Search node: Query is required");
  }

  const maxResults = resolveMaxResults(renderTemplate(data.maxResults, context));
  const maxSnippet = resolveMaxCharacters(renderTemplate(data.maxCharacters, context), {
    fallback: SEARCH_DEFAULT_SNIPPET,
    min: 50,
    max: SEARCH_MAX_SNIPPET,
  });

  const baseUrl = renderTemplate(data.searxngUrl, context).trim().replace(/\/+$/, "");
  if (provider === "searxng" && !/^https?:\/\//i.test(baseUrl)) {
    throw new NonRetriableError(
      "Web Search node: SearXNG URL must be your server's http(s) address, for example https://search.example.com"
    );
  }

  const apiKey =
    provider === "searxng"
      ? ""
      : await loadCredentialSecret({
          step,
          stepId: `web-search-${nodeId}-get-credential`,
          credentialId: data.credentialId,
          userId,
          label: "Web Search",
        });

  try {
    const results = await step.run(`web-search-${nodeId}`, async () => {
      let body: unknown;

      if (provider === "tavily") {
        body = await ky
          .post("https://api.tavily.com/search", {
            headers: { Authorization: `Bearer ${apiKey}` },
            json: { query, max_results: maxResults, search_depth: "basic" },
            timeout: 30_000,
          })
          .json();
      } else if (provider === "brave") {
        body = await ky
          .get("https://api.search.brave.com/res/v1/web/search", {
            headers: { "X-Subscription-Token": apiKey, Accept: "application/json" },
            searchParams: { q: query, count: maxResults },
            timeout: 30_000,
          })
          .json();
      } else {
        // The address is typed in by the user: it goes through the SSRF
        // guard like every other one. A server on a private network has
        // to be on PRIVATE_NETWORK_ALLOWLIST.
        const url = new URL(`${baseUrl}/search`);
        url.searchParams.set("q", query);
        url.searchParams.set("format", "json");

        const response = await safeFetch(url, {
          headers: { Accept: "application/json" },
          signal: AbortSignal.timeout(30_000),
        });

        if (!response.ok) {
          throw new NonRetriableError(
            `Web Search node: the SearXNG server answered ${response.status}${
              response.status === 403
                ? '. Its JSON output is probably off: add "json" to search.formats in its settings.yml'
                : ""
            }`
          );
        }

        body = await response.json().catch(() => {
          throw new NonRetriableError(
            'Web Search node: the SearXNG server did not answer with JSON. Add "json" to search.formats in its settings.yml'
          );
        });
      }

      return normalizeSearchResults(provider, body, { maxResults, maxSnippet });
    });

    return {
      ...context,
      [variableName]: {
        query,
        provider,
        results,
        count: results.length,
      },
    };
  } catch (error) {
    if (error instanceof BlockedRequestError) {
      throw new NonRetriableError(`Web Search node: ${error.message}`);
    }

    throw await toIntegrationError(
      provider === "searxng" ? "Web Search" : `Web Search (${SEARCH_CREDENTIALS[provider]})`,
      error
    );
  }
};

// =========================================================================
// READ WEB PAGE
// =========================================================================
export const PAGE_READERS = [
  { value: "builtin", label: "Built-in reader" },
  { value: "jina", label: "Jina Reader" },
  { value: "firecrawl", label: "Firecrawl" },
] as const;

export const PAGE_DEFAULT_CHARACTERS = 8000;
export const PAGE_MAX_CHARACTERS = 100_000;

// The most of a page that is downloaded
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
const PAGE_TIMEOUT_MS = 20_000;

/**
 * Reads a response body up to a size, so a huge or endless download cannot
 * hold up a run or fill its memory.
 */
const readLimited = async (response: Response, maxBytes: number): Promise<Buffer> => {
  const reader = response.body?.getReader();
  if (!reader) return Buffer.from(await response.arrayBuffer()).subarray(0, maxBytes);

  const chunks: Uint8Array[] = [];
  let size = 0;

  try {
    while (size < maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;

      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  return Buffer.concat(chunks).subarray(0, maxBytes);
};

const decodeBody = (bytes: Buffer, contentType: string): string => {
  const charset =
    /charset\s*=\s*["']?([\w-]+)/i.exec(contentType)?.[1] ??
    // <meta charset="..."> in the first part of the page
    /<meta[^>]+charset\s*=\s*["']?([\w-]+)/i.exec(bytes.subarray(0, 2048).toString("latin1"))?.[1] ??
    "utf-8";

  try {
    return new TextDecoder(charset).decode(bytes);
  } catch {
    // A charset this runtime does not know
    return new TextDecoder("utf-8").decode(bytes);
  }
};

/**
 * Downloads a page through the SSRF guard (every redirect is checked too)
 * and extracts its main content.
 */
export const readPageBuiltin = async (
  url: string,
  format: "markdown" | "text"
): Promise<{ title: string; description: string; content: string; url: string }> => {
  const response = await safeFetch(url, {
    headers: {
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      "User-Agent": "Mozilla/5.0 (compatible; RXJ-PageReader/1.0)",
    },
    signal: AbortSignal.timeout(PAGE_TIMEOUT_MS),
  });

  if (!response.ok) {
    await response.body?.cancel().catch(() => {});
    throw new NonRetriableError(
      `Read Web Page node: the page answered ${response.status}`
    );
  }

  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  const isHtml = /html|xml/.test(contentType) || !contentType;
  const isText = /^text\/|json/.test(contentType);

  if (!isHtml && !isText) {
    await response.body?.cancel().catch(() => {});
    throw new NonRetriableError(
      `Read Web Page node: the address is not a web page (${contentType.split(";")[0] || "unknown type"}). Use an HTTP Request node with Response Format File to download it.`
    );
  }

  const body = decodeBody(await readLimited(response, MAX_PAGE_BYTES), contentType);
  const finalUrl = response.url || url;

  if (!isHtml) {
    return { title: "", description: "", content: body.trim(), url: finalUrl };
  }

  return { ...extractReadableContent(body, { format, baseUrl: finalUrl }), url: finalUrl };
};

/**
 * Fetches a web page and returns its main content as Markdown or text. The
 * built-in reader reads the page's HTML; Jina Reader and Firecrawl open it
 * in a browser first, for pages that build their content with JavaScript.
 */
export const readWebPageExecutor: NodeExecutor<WebData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "page";
  const reader = data.operation || "builtin";

  if (!PAGE_READERS.some((entry) => entry.value === reader)) {
    throw new NonRetriableError(`Read Web Page node: Unsupported reader "${reader}"`);
  }

  const url = renderTemplate(data.url, context).trim();
  if (!/^https?:\/\//i.test(url)) {
    throw new NonRetriableError(
      "Read Web Page node: URL must start with http:// or https://"
    );
  }

  const format = data.format === "text" ? "text" : "markdown";
  const maxCharacters = resolveMaxCharacters(renderTemplate(data.maxCharacters, context), {
    fallback: PAGE_DEFAULT_CHARACTERS,
    max: PAGE_MAX_CHARACTERS,
  });

  const apiKey =
    reader === "builtin"
      ? ""
      : await loadCredentialSecret({
          step,
          stepId: `read-web-page-${nodeId}-get-credential`,
          credentialId: data.credentialId,
          userId,
          label: "Read Web Page",
        });

  try {
    const page = await step.run(`read-web-page-${nodeId}`, async () => {
      let result: { title: string; description: string; content: string; url: string };

      if (reader === "builtin") {
        result = await readPageBuiltin(url, format);
      } else {
        // The reader service fetches the page, not this server. The address
        // is checked all the same: a workflow must not be a way to point
        // someone else's crawler at a private address.
        await assertPublicUrl(url);

        if (reader === "jina") {
          const body = await ky
            .get(`https://r.jina.ai/${url}`, {
              headers: {
                Authorization: `Bearer ${apiKey}`,
                Accept: "application/json",
                "X-Return-Format": format === "text" ? "text" : "markdown",
              },
              timeout: 60_000,
            })
            .json<{ data?: { title?: string; description?: string; content?: string; url?: string } }>();

          result = {
            title: cleanLine(body.data?.title),
            description: cleanLine(body.data?.description),
            content: text(body.data?.content).trim(),
            url: text(body.data?.url) || url,
          };
        } else {
          const body = await ky
            .post("https://api.firecrawl.dev/v1/scrape", {
              headers: { Authorization: `Bearer ${apiKey}` },
              json: { url, formats: ["markdown"], onlyMainContent: true },
              timeout: 90_000,
            })
            .json<{
              data?: {
                markdown?: string;
                metadata?: { title?: string; description?: string; sourceURL?: string };
              };
            }>();

          result = {
            title: cleanLine(body.data?.metadata?.title),
            description: cleanLine(body.data?.metadata?.description),
            content: text(body.data?.markdown).trim(),
            url: text(body.data?.metadata?.sourceURL) || url,
          };
        }
      }

      // Cut inside the step: the whole page is never kept in the run
      const limited = limitText(result.content, maxCharacters);

      return {
        url: result.url.slice(0, 2000),
        title: result.title.slice(0, 300),
        description: result.description.slice(0, 1000),
        content: limited.text,
        truncated: limited.truncated,
        // Of the whole page, before it was cut
        length: result.content.length,
      };
    });

    if (!page.content) {
      throw new NonRetriableError(
        reader === "builtin"
          ? "Read Web Page node: no text was found on the page. It may build its content with JavaScript: choose Jina Reader or Firecrawl."
          : "Read Web Page node: the reader returned no text for this page"
      );
    }

    return { ...context, [variableName]: { ...page, reader } };
  } catch (error) {
    if (error instanceof BlockedRequestError) {
      throw new NonRetriableError(`Read Web Page node: ${error.message}`);
    }

    throw await toIntegrationError("Read Web Page", error);
  }
};

// For the tests
export const webInternals = { readLimited, decodeBody };
