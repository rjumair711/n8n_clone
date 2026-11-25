import { NonRetriableError } from "inngest";
import { google } from "googleapis";
import prisma from "@/lib/db";
import { getGoogleAuth } from "@/lib/google-oauth";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { renderTemplate } from "../../lib/templates";
import {
  SEARCH_CONSOLE_DIMENSIONS,
  SEARCH_CONSOLE_MAX_ROWS,
  SEARCH_CONSOLE_SCOPE,
  SEARCH_CONSOLE_TYPES,
} from "../../lib/search-console-options";

// The Google Search Console node: how a site does in Google Search (clicks,
// impressions, CTR, position), whether a page is indexed, and its sites and
// sitemaps. Read-only (webmasters.readonly). Signs in with a Google account
// or a service account that was added as a user of the property.
//
// Each operation's request is built first by a function that touches
// nothing, so what would be asked can be tested.

type SearchConsoleData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

const LABEL = "Google Search Console";
export const SEARCH_CONSOLE_DEFAULT_OPERATION = "search_analytics";
const DEFAULT_ROWS = 100;
const DEFAULT_DAYS = 28;
// Search data is final about three days after the day
const DATA_DELAY_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

const isoDay = (time: number) => new Date(time).toISOString().slice(0, 10);

const fail = (message: string) => new NonRetriableError(`${LABEL} node: ${message}`);

/**
 * The property as Search Console names it: a URL-prefix property with its
 * trailing slash ("https://example.com/"), or a domain property
 * ("sc-domain:example.com"). "example.com" alone is taken as the domain.
 */
export const normalizeSiteUrl = (value: string): string => {
  const text = value.trim();
  if (!text) throw fail("Site is required");

  if (/^sc-domain:/i.test(text)) {
    const domain = text.slice("sc-domain:".length).trim().toLowerCase();
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw fail(`Site "${text}" is not a domain property: write it as sc-domain:example.com`);
    return `sc-domain:${domain}`;
  }

  if (/^https?:\/\//i.test(text)) {
    let url: URL;
    try {
      url = new URL(text);
    } catch {
      throw fail(`Site "${text}" is not a site address`);
    }
    const path = url.pathname.endsWith("/") ? url.pathname : `${url.pathname}/`;
    return `${url.protocol}//${url.host}${path}`;
  }

  if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(text)) return `sc-domain:${text.toLowerCase()}`;

  throw fail(
    `Site must be the property as Search Console shows it: https://example.com/ or sc-domain:example.com`
  );
};

// A date the user typed, or N days ago: "2026-11-01", "28 days ago", "today"
const readDate = (value: string, title: string, now: number): string => {
  const text = value.trim().toLowerCase();
  const ago = text.match(/^(\d{1,4})\s*days?\s*ago$/);
  if (ago) return isoDay(now - Number(ago[1]) * DAY_MS);
  if (text === "today") return isoDay(now);
  if (text === "yesterday") return isoDay(now - DAY_MS);
  if (/^\d{4}-\d{2}-\d{2}$/.test(text) && Number.isFinite(Date.parse(text))) return text;
  throw fail(`${title} must be a date like 2026-11-01, or "28 days ago"`);
};

export type SearchAnalyticsRequest = {
  siteUrl: string;
  requestBody: {
    startDate: string;
    endDate: string;
    dimensions: string[];
    type: string;
    rowLimit: number;
    dimensionFilterGroups?: { filters: { dimension: string; operator: string; expression: string }[] }[];
  };
};

/** The Search Analytics query, from the node's settings. */
export const buildSearchAnalyticsRequest = (
  data: SearchConsoleData,
  context: WorkflowContext,
  now = Date.now()
): SearchAnalyticsRequest => {
  const field = (name: string) => renderTemplate(data[name], context).trim();
  const siteUrl = normalizeSiteUrl(field("siteUrl"));

  const endDate = field("endDate")
    ? readDate(field("endDate"), "End Date", now)
    : isoDay(now - DATA_DELAY_DAYS * DAY_MS);
  const startDate = field("startDate")
    ? readDate(field("startDate"), "Start Date", now)
    : isoDay(Date.parse(endDate) - (DEFAULT_DAYS - 1) * DAY_MS);
  if (startDate > endDate) throw fail("Start Date is after End Date");

  // Any case: "Query, PAGE" is query and page
  const dimensions = (field("dimensions") || "query")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const known = SEARCH_CONSOLE_DIMENSIONS.find((option) => option.value.toLowerCase() === entry.toLowerCase());
      if (!known) {
        throw fail(
          `"${entry}" is not a dimension. Use ${SEARCH_CONSOLE_DIMENSIONS.map((option) => option.value).join(", ")}`
        );
      }
      return known.value;
    });
  if (new Set(dimensions).size !== dimensions.length) throw fail("a dimension is there twice");

  const type = field("searchType") || "web";
  if (!SEARCH_CONSOLE_TYPES.some((option) => option.value === type)) throw fail(`"${type}" is not a search type`);

  const count = Math.floor(Number(field("rowLimit")));
  const rowLimit = Number.isFinite(count) && count >= 1 ? Math.min(count, SEARCH_CONSOLE_MAX_ROWS) : DEFAULT_ROWS;

  const filters = [
    ["query", field("queryContains")],
    ["page", field("pageContains")],
    ["country", field("country").toLowerCase()],
    ["device", field("device").toUpperCase()],
  ]
    .filter(([, expression]) => expression)
    .map(([dimension, expression]) => ({
      dimension,
      operator: dimension === "query" || dimension === "page" ? "contains" : "equals",
      expression,
    }));

  const country = field("country");
  if (country && !/^[a-z]{3}$/i.test(country)) {
    throw fail("Country must be a three-letter code, for example pak, are or usa");
  }
  const device = field("device").toUpperCase();
  if (device && !["DESKTOP", "MOBILE", "TABLET"].includes(device)) {
    throw fail("Device must be desktop, mobile or tablet");
  }

  return {
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      type,
      rowLimit,
      ...(filters.length ? { dimensionFilterGroups: [{ filters }] } : {}),
    },
  };
};

/** Rows with one named field per dimension, and the totals over them. */
export const shapeSearchAnalytics = (dimensions: string[], response: unknown) => {
  const rows = (Array.isArray((response as { rows?: unknown })?.rows) ? (response as { rows: unknown[] }).rows : []).map(
    (row) => {
      const value = (row ?? {}) as { keys?: unknown[]; clicks?: number; impressions?: number; ctr?: number; position?: number };
      const keys = Array.isArray(value.keys) ? value.keys : [];
      return {
        ...Object.fromEntries(dimensions.map((dimension, index) => [dimension, String(keys[index] ?? "")])),
        clicks: value.clicks ?? 0,
        impressions: value.impressions ?? 0,
        // A fraction from 0 to 1, as Google gives it
        ctr: value.ctr ?? 0,
        position: Math.round((value.position ?? 0) * 10) / 10,
      };
    }
  );

  const clicks = rows.reduce((sum, row) => sum + row.clicks, 0);
  const impressions = rows.reduce((sum, row) => sum + row.impressions, 0);
  // Average position weighted by impressions, like Search Console's own
  const position = impressions
    ? Math.round((rows.reduce((sum, row) => sum + row.position * row.impressions, 0) / impressions) * 10) / 10
    : 0;

  return {
    rows,
    count: rows.length,
    totals: { clicks, impressions, ctr: impressions ? clicks / impressions : 0, position },
  };
};

/** What the URL Inspection API says about one page, the useful parts first. */
export const shapeInspection = (response: unknown) => {
  const result = ((response as { inspectionResult?: Record<string, any> })?.inspectionResult ?? {}) as Record<string, any>;
  const index = result.indexStatusResult ?? {};

  return {
    // PASS (on Google), NEUTRAL (excluded), FAIL (an error), or empty
    verdict: index.verdict ?? "",
    indexed: index.verdict === "PASS",
    coverageState: index.coverageState ?? "",
    indexingState: index.indexingState ?? "",
    robotsTxtState: index.robotsTxtState ?? "",
    pageFetchState: index.pageFetchState ?? "",
    lastCrawlTime: index.lastCrawlTime ?? null,
    googleCanonical: index.googleCanonical ?? "",
    userCanonical: index.userCanonical ?? "",
    mobileUsability: result.mobileUsabilityResult?.verdict ?? "",
    link: result.inspectionResultLink ?? "",
    result,
  };
};

// Google's error, with what to do for the usual ones
const describeGoogleError = (error: any): string => {
  const status = error?.code ?? error?.response?.status;
  const message: string =
    error?.response?.data?.error?.message || error?.errors?.[0]?.message || error?.message || "the request failed";

  if (/insufficient authentication scopes|insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(message) || (status === 403 && /scope/i.test(message))) {
    return `${message}. The Google account was connected before Search Console was added: open the credential and connect it again.`;
  }
  if (status === 403) {
    return `${message}. The account (or the service account's email) must be a user of this property in Search Console (Settings > Users and permissions), and the Site must be written exactly as Search Console shows it.`;
  }
  if (/invalid_grant/i.test(message)) {
    return `${message}. The Google sign-in expired or was removed: open the credential and connect it again.`;
  }
  return message;
};

/**
 * Search performance, URL inspection, sites and sitemaps of Search Console.
 */
export const searchConsoleExecutor: NodeExecutor<SearchConsoleData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "searchConsole";
  const operation = data.operation || SEARCH_CONSOLE_DEFAULT_OPERATION;
  const field = (name: string) => renderTemplate(data[name], context).trim();

  // Every check of the fields comes before the credential is read
  if (!["search_analytics", "inspect_url", "list_sites", "list_sitemaps"].includes(operation)) {
    throw fail(`Unsupported operation "${operation}"`);
  }
  const analytics = operation === "search_analytics" ? buildSearchAnalyticsRequest(data, context) : null;
  const siteUrl = operation === "list_sites" ? "" : normalizeSiteUrl(field("siteUrl"));
  const inspectionUrl = operation === "inspect_url" ? field("inspectionUrl") : "";
  if (operation === "inspect_url") {
    if (!/^https?:\/\//i.test(inspectionUrl)) throw fail("Page URL must be the page's full address, https://...");
    if (!siteUrl.startsWith("sc-domain:") && !inspectionUrl.startsWith(siteUrl.replace(/\/$/, ""))) {
      throw fail("Page URL must be inside the Site (the property it belongs to)");
    }
  }

  if (!data.credentialId) throw fail("Credential is required");

  const credential = await step.run(`search-console-${nodeId}-get-credential`, async () =>
    prisma.credential.findUnique({
      where: { id: data.credentialId, userId },
      select: { type: true, value: true, userId: true },
    })
  );
  if (!credential) throw fail("Credential not found");
  if (credential.type !== "GOOGLE_OAUTH2" && credential.type !== "GOOGLE_SEARCH_CONSOLE") {
    throw fail("pick a Google account or a Google Search Console service account credential");
  }

  try {
    const result = await step.run(`search-console-${nodeId}-${operation}`, async () => {
      const auth = await getGoogleAuth(LABEL, credential, [SEARCH_CONSOLE_SCOPE]);
      const api = google.searchconsole({ version: "v1", auth });

      if (analytics) {
        const response = await api.searchanalytics.query(analytics);
        return {
          ...shapeSearchAnalytics(analytics.requestBody.dimensions, response.data),
          siteUrl: analytics.siteUrl,
          startDate: analytics.requestBody.startDate,
          endDate: analytics.requestBody.endDate,
        };
      }

      if (operation === "inspect_url") {
        const response = await api.urlInspection.index.inspect({ requestBody: { inspectionUrl, siteUrl } });
        return { ...shapeInspection(response.data), inspectionUrl, siteUrl };
      }

      if (operation === "list_sitemaps") {
        const response = await api.sitemaps.list({ siteUrl });
        const items = (response.data.sitemap ?? []).map((sitemap) => ({
          path: sitemap.path ?? "",
          lastSubmitted: sitemap.lastSubmitted ?? null,
          lastDownloaded: sitemap.lastDownloaded ?? null,
          isPending: sitemap.isPending ?? false,
          errors: Number(sitemap.errors ?? 0),
          warnings: Number(sitemap.warnings ?? 0),
          contents: sitemap.contents ?? [],
        }));
        return { items, count: items.length, siteUrl };
      }

      const response = await api.sites.list();
      const items = (response.data.siteEntry ?? []).map((site) => ({
        siteUrl: site.siteUrl ?? "",
        permissionLevel: site.permissionLevel ?? "",
      }));
      return { items, count: items.length };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;
    throw new NonRetriableError(`${LABEL} API error: ${describeGoogleError(error)}`);
  }
};
