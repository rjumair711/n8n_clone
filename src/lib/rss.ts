import { XMLParser } from "fast-xml-parser";
import { safeFetch } from "./ssrf";

export type FeedItem = {
  // What makes the item unique in its feed: guid / id, else its link
  id: string;
  title: string;
  link: string;
  // ISO 8601, or null when the feed gives no usable date
  pubDate: string | null;
  author: string;
  // Plain-text summary
  snippet: string;
  // The body as the feed sent it (often HTML)
  content: string;
  categories: string[];
};

export type Feed = {
  title: string;
  link: string;
  description: string;
  items: FeedItem[];
};

const FETCH_TIMEOUT_MS = 15_000;
const MAX_FEED_BYTES = 3 * 1024 * 1024;
const SNIPPET_LENGTH = 300;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  // Titles like "Tom &amp; Jerry" arrive decoded
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

const asList = <T>(value: T | T[] | undefined | null): T[] =>
  value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];

// An element is a string, a number, or an object when it has attributes
const text = (value: unknown): string => {
  if (value === undefined || value === null) return "";
  if (typeof value === "object") {
    const inner = (value as Record<string, unknown>)["#text"];
    return inner === undefined || inner === null ? "" : String(inner).trim();
  }
  return String(value).trim();
};

const toIsoDate = (value: unknown): string | null => {
  const raw = text(value);
  if (!raw) return null;

  const date = new Date(raw);

  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const toSnippet = (html: string) => {
  const plain = html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return plain.length > SNIPPET_LENGTH
    ? `${plain.slice(0, SNIPPET_LENGTH).trimEnd()}...`
    : plain;
};

// Atom has several <link> elements; the article is the "alternate" one
const atomLink = (links: unknown): string => {
  const list = asList(links as any);

  const chosen =
    list.find(
      (link: any) => typeof link === "object" && (link["@_rel"] ?? "alternate") === "alternate"
    ) ?? list[0];

  return typeof chosen === "object" && chosen
    ? String((chosen as any)["@_href"] ?? "").trim()
    : text(chosen);
};

const rssItem = (item: any): FeedItem => {
  const link = text(item.link);
  const content = text(item["content:encoded"]) || text(item.description);
  const title = text(item.title);
  const pubDate = toIsoDate(item.pubDate ?? item["dc:date"]);

  return {
    id: text(item.guid) || link || `${title}|${pubDate ?? ""}`,
    title,
    link,
    pubDate,
    author: text(item["dc:creator"]) || text(item.author),
    snippet: toSnippet(text(item.description) || content),
    content,
    categories: asList(item.category).map(text).filter(Boolean),
  };
};

const atomEntry = (entry: any): FeedItem => {
  const link = atomLink(entry.link);
  const content = text(entry.content) || text(entry.summary);
  const title = text(entry.title);
  const pubDate = toIsoDate(entry.published ?? entry.updated);

  return {
    id: text(entry.id) || link || `${title}|${pubDate ?? ""}`,
    title,
    link,
    pubDate,
    author: asList(entry.author)
      .map((author: any) => text(author?.name ?? author))
      .filter(Boolean)
      .join(", "),
    snippet: toSnippet(text(entry.summary) || content),
    content,
    categories: asList(entry.category)
      .map((category: any) =>
        typeof category === "object" && category
          ? String(category["@_term"] ?? category["@_label"] ?? "").trim()
          : text(category)
      )
      .filter(Boolean),
  };
};

/**
 * Reads an RSS 2.0, RSS 1.0 (RDF) or Atom document.
 */
export const parseFeed = (xml: string): Feed => {
  let document: any;
  try {
    document = parser.parse(xml);
  } catch {
    throw new Error("The address did not return a valid feed");
  }

  const channel = document?.rss?.channel;
  if (channel) {
    return {
      title: text(channel.title),
      link: text(channel.link),
      description: text(channel.description),
      items: asList(channel.item).map(rssItem),
    };
  }

  const atom = document?.feed;
  if (atom) {
    return {
      title: text(atom.title),
      link: atomLink(atom.link),
      description: text(atom.subtitle),
      items: asList(atom.entry).map(atomEntry),
    };
  }

  // RSS 1.0: the items sit next to the channel
  const rdf = document?.["rdf:RDF"];
  if (rdf) {
    return {
      title: text(rdf.channel?.title),
      link: text(rdf.channel?.link),
      description: text(rdf.channel?.description),
      items: asList(rdf.item).map(rssItem),
    };
  }

  throw new Error(
    "The address did not return an RSS or Atom feed. Check that it is the feed's own URL, not the website's page."
  );
};

/**
 * Downloads and reads a feed. The URL is typed in by a user, so the request
 * goes through the SSRF guard.
 */
export const fetchFeed = async (url: string): Promise<Feed> => {
  const response = await safeFetch(url, {
    headers: {
      Accept:
        "application/rss+xml, application/atom+xml, application/xml, text/xml, */*;q=0.5",
      "User-Agent": "rxj-workflows",
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(
      `The feed answered with status ${response.status} ${response.statusText}`
    );
  }

  const xml = await response.text();

  if (Buffer.byteLength(xml) > MAX_FEED_BYTES) {
    throw new Error(
      `The feed is larger than ${MAX_FEED_BYTES / 1024 / 1024} MB`
    );
  }

  return parseFeed(xml);
};
