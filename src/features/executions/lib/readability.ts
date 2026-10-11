import { decode } from "html-entities";

// A small readability extractor: takes the HTML of a web page and returns
// its main content as Markdown or plain text, without navigation, sidebars,
// cookie banners, scripts and the like. No DOM and no dependencies: the
// HTML is read into a light tree, the block that looks most like the
// article is chosen, and that block is written out.
//
// It reads what the server sent. A page that builds its content with
// JavaScript has little to read; that is what the Jina Reader and Firecrawl
// options of the Read Web Page node are for.

type TextNode = { text: string };
type ElementNode = {
  tag: string;
  attributes: Record<string, string>;
  children: PageNode[];
  parent: ElementNode | null;
};
type PageNode = TextNode | ElementNode;

const isElement = (node: PageNode): node is ElementNode => "tag" in node;

// Their content is never text of the page
const RAW_ELEMENTS =
  "script|style|noscript|template|svg|iframe|canvas|object|embed|audio|video|map|select|textarea";

const TOKEN = new RegExp(
  [
    "<!--[\\s\\S]*?-->",
    `<(${RAW_ELEMENTS})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`,
    "<!\\[CDATA\\[[\\s\\S]*?\\]\\]>",
    "<![^>]*>",
    "<\\?[^>]*>",
    "<\\/([a-zA-Z][a-zA-Z0-9:-]*)\\s*>",
    "<([a-zA-Z][a-zA-Z0-9:-]*)((?:[^>\"']|\"[^\"]*\"|'[^']*')*)>",
    "([^<]+)",
    "<",
  ].join("|"),
  "g"
);

const ATTRIBUTE = /([^\s=/"'<>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;

const VOID_ELEMENTS = new Set([
  "area", "base", "br", "col", "hr", "img", "input", "link", "meta", "source", "track", "wbr",
]);

// Opening one of these closes an open one of the same kind (HTML lets
// their end tags be left out)
const SELF_CLOSING_SIBLINGS: Record<string, string[]> = {
  li: ["li"],
  p: ["p"],
  dt: ["dt", "dd"],
  dd: ["dt", "dd"],
  tr: ["tr", "td", "th"],
  td: ["td", "th"],
  th: ["td", "th"],
  option: ["option"],
};

// The most of a page that is read, so a huge page cannot hold up a run
const MAX_HTML_CHARS = 3_000_000;
const MAX_DEPTH = 200;

const parseAttributes = (source: string): Record<string, string> => {
  const attributes: Record<string, string> = {};

  for (const match of source.matchAll(ATTRIBUTE)) {
    const name = match[1].toLowerCase();
    if (!(name in attributes)) {
      attributes[name] = decode(match[2] ?? match[3] ?? match[4] ?? "");
    }
  }

  return attributes;
};

const parseHtml = (html: string): ElementNode => {
  const root: ElementNode = { tag: "#root", attributes: {}, children: [], parent: null };
  let current = root;
  let depth = 0;

  const close = (tag: string) => {
    // An end tag without its start tag is ignored
    for (let node: ElementNode | null = current, up = 0; node && node !== root; node = node.parent, up++) {
      if (node.tag === tag) {
        current = node.parent ?? root;
        depth -= up + 1;
        return;
      }
    }
  };

  for (const match of html.slice(0, MAX_HTML_CHARS).matchAll(TOKEN)) {
    const [, , endTag, startTag, attributeSource, text] = match;

    if (text !== undefined) {
      current.children.push({ text });
      continue;
    }

    if (endTag) {
      close(endTag.toLowerCase());
      continue;
    }

    if (!startTag) continue;

    const tag = startTag.toLowerCase();

    const siblings = SELF_CLOSING_SIBLINGS[tag];
    if (siblings && siblings.includes(current.tag)) {
      current = current.parent ?? root;
      depth--;
    }

    const element: ElementNode = {
      tag,
      attributes: parseAttributes(attributeSource ?? ""),
      children: [],
      parent: current,
    };
    current.children.push(element);

    const selfClosed = /\/\s*$/.test(attributeSource ?? "");

    // Too deep to be a real page: the rest is kept flat
    if (!VOID_ELEMENTS.has(tag) && !selfClosed && depth < MAX_DEPTH) {
      current = element;
      depth++;
    }
  }

  return root;
};

// ------------------------------------------------------------- cleaning
// Parts of a page that are not its content
const NOISE_TAGS = new Set([
  "nav", "header", "footer", "aside", "form", "button", "dialog", "menu", "input", "label", "head",
  "figcaption",
]);

const NOISE_ROLES = new Set([
  "navigation", "banner", "contentinfo", "complementary", "search", "dialog", "alert", "menu",
  "menubar", "toolbar", "tablist",
]);

const NOISE_NAME =
  /(^|[\s_-])(nav|navbar|navigation|menu|sidebar|side-bar|footer|header|masthead|cookie|cookies|consent|gdpr|banner|advert|advertisement|ads?|sponsor|promo|share|sharing|social|comments?|disqus|related|recommended|breadcrumbs?|newsletter|subscribe|signup|popup|modal|overlay|paywall|toc|pagination|pager|skip-link|widget)([\s_-]|$)/i;

// Never dropped by their class name: they are where the content is
const CONTENT_TAGS = new Set(["html", "body", "main", "article"]);

const isHidden = (element: ElementNode) =>
  "hidden" in element.attributes ||
  element.attributes["aria-hidden"] === "true" ||
  /display\s*:\s*none|visibility\s*:\s*hidden/i.test(element.attributes.style ?? "");

const isNoise = (element: ElementNode, insideContent: boolean) => {
  // An article's own <header> holds its headline
  if (element.tag === "header" && insideContent) return false;
  if (NOISE_TAGS.has(element.tag)) return true;
  if (NOISE_ROLES.has((element.attributes.role ?? "").toLowerCase())) return true;
  if (isHidden(element)) return true;
  if (CONTENT_TAGS.has(element.tag)) return false;

  return NOISE_NAME.test(`${element.attributes.class ?? ""} ${element.attributes.id ?? ""}`);
};

const removeNoise = (element: ElementNode, insideContent = false) => {
  const inside =
    insideContent ||
    element.tag === "article" ||
    element.tag === "main" ||
    element.attributes.role === "main";

  element.children = element.children.filter(
    (child) => !isElement(child) || !isNoise(child, inside)
  );

  for (const child of element.children) {
    if (isElement(child)) removeNoise(child, inside);
  }
};

const textOf = (node: PageNode): string =>
  isElement(node) ? node.children.map(textOf).join(" ") : node.text;

const textLength = (node: PageNode) => textOf(node).replace(/\s+/g, " ").trim().length;

const findAll = (element: ElementNode, test: (candidate: ElementNode) => boolean): ElementNode[] => {
  const found: ElementNode[] = [];

  const visit = (node: ElementNode) => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      if (test(child)) found.push(child);
      visit(child);
    }
  };

  visit(element);
  return found;
};

const linkTextLength = (element: ElementNode) =>
  findAll(element, (candidate) => candidate.tag === "a").reduce(
    (total, link) => total + textLength(link),
    0
  );

// Too little to be an article: the search goes on
const MIN_CONTENT_CHARS = 200;

/**
 * The element that holds the page's main content: its <article> or <main>
 * when it has one with enough text, otherwise the block whose paragraphs
 * hold the most text that is not links.
 */
const findContent = (root: ElementNode): ElementNode => {
  const largest = (elements: ElementNode[]) =>
    elements
      .map((element) => ({ element, length: textLength(element) }))
      .sort((a, b) => b.length - a.length)[0];

  for (const candidates of [
    findAll(root, (element) => element.tag === "article"),
    findAll(
      root,
      (element) => element.tag === "main" || element.attributes.role === "main"
    ),
  ]) {
    const best = largest(candidates);
    if (best && best.length >= MIN_CONTENT_CHARS) return best.element;
  }

  // Each paragraph gives its text to its parent, and half of it to the
  // parent's parent, like Readability does
  const scores = new Map<ElementNode, number>();

  for (const paragraph of findAll(root, (element) => ["p", "pre", "blockquote", "li"].includes(element.tag))) {
    const length = textLength(paragraph);
    if (length < 25) continue;

    const score = 1 + Math.min(Math.floor(length / 100), 3) + (textOf(paragraph).match(/[,،、]/g)?.length ?? 0);

    if (paragraph.parent) {
      scores.set(paragraph.parent, (scores.get(paragraph.parent) ?? 0) + score);

      if (paragraph.parent.parent) {
        scores.set(
          paragraph.parent.parent,
          (scores.get(paragraph.parent.parent) ?? 0) + score / 2
        );
      }
    }
  }

  let best: ElementNode | null = null;
  let bestScore = 0;

  for (const [element, score] of scores) {
    const length = textLength(element) || 1;
    // A block that is mostly links is a menu or a list of teasers
    const weighted = score * (1 - Math.min(linkTextLength(element) / length, 1));

    if (weighted > bestScore) {
      best = element;
      bestScore = weighted;
    }
  }

  return best ?? findAll(root, (element) => element.tag === "body")[0] ?? root;
};

// ------------------------------------------------------------- writing
const BLOCK_TAGS = new Set([
  "address", "article", "blockquote", "body", "dd", "details", "div", "dl", "dt", "fieldset",
  "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "li", "main", "ol", "p", "pre", "section",
  "summary", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

const collapse = (text: string) => text.replace(/[ \t\r\n\f\u00a0]+/g, " ");

// Inline text with its line breaks (from <br>) kept and everything else tidy
const tidyLines = (text: string) =>
  text
    .split("\n")
    .map((line) => collapse(line).trim())
    .join("\n")
    .trim();

// An element is written as a block when it is one, or when it wraps one:
// <header><h1>, <a><div>, <span><p> and the like
const blockCache = new WeakMap<ElementNode, boolean>();

const isBlock = (element: ElementNode): boolean => {
  const known = blockCache.get(element);
  if (known !== undefined) return known;

  const block =
    BLOCK_TAGS.has(element.tag) ||
    element.children.some((child) => isElement(child) && isBlock(child));

  blockCache.set(element, block);
  return block;
};

const resolveUrl = (href: string, baseUrl: string | undefined): string | null => {
  const value = href.trim();
  if (!value || value.startsWith("#")) return null;

  try {
    const url = new URL(value, baseUrl);

    // Only links a person could follow
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

type WriteOptions = {
  markdown: boolean;
  baseUrl?: string;
};

const writeInline = (node: PageNode, options: WriteOptions): string => {
  if (!isElement(node)) return decode(collapse(node.text));

  if (node.tag === "br") return "\n";
  if (node.tag === "img") return "";

  const inner = node.children.map((child) => writeInline(child, options)).join("");

  if (!options.markdown) return inner;

  const text = inner.trim();
  if (!text) return inner;

  switch (node.tag) {
    case "a": {
      const url = resolveUrl(node.attributes.href ?? "", options.baseUrl);

      // Square brackets and new lines would break the link
      return url ? `[${text.replace(/[\[\]\n]+/g, " ")}](${url})` : inner;
    }
    case "strong":
    case "b":
      return `**${text}**`;
    case "em":
    case "i":
      return `*${text}*`;
    case "code":
    case "kbd":
    case "samp":
      return `\`${text}\``;
    default:
      return inner;
  }
};

const writeBlocks = (element: ElementNode, options: WriteOptions, into: string[]): void => {
  // Text and inline elements that follow each other make one paragraph
  let inline = "";

  const flush = () => {
    const text = tidyLines(inline);
    if (text) into.push(text);
    inline = "";
  };

  for (const child of element.children) {
    if (!isElement(child) || !isBlock(child)) {
      inline += writeInline(child, options);
      continue;
    }

    flush();
    writeBlock(child, options, into);
  }

  flush();
};

const writeBlock = (element: ElementNode, options: WriteOptions, into: string[]): void => {
  const inlineText = () =>
    tidyLines(element.children.map((child) => writeInline(child, options)).join(""));

  switch (element.tag) {
    case "h1":
    case "h2":
    case "h3":
    case "h4":
    case "h5":
    case "h6": {
      const text = collapse(textOfDecoded(element)).trim();
      if (text) into.push(options.markdown ? `${"#".repeat(Number(element.tag[1]))} ${text}` : text);
      return;
    }

    case "p": {
      // A paragraph that wraps blocks (broken HTML) is written block by block
      if (element.children.some((child) => isElement(child) && isBlock(child))) {
        writeBlocks(element, options, into);
        return;
      }

      const text = inlineText();
      if (text) into.push(text);
      return;
    }

    case "hr":
      if (options.markdown) into.push("---");
      return;

    case "pre": {
      const code = decode(textOf(element)).replace(/^\n+|\s+$/g, "");
      if (code) into.push(options.markdown ? `\`\`\`\n${code}\n\`\`\`` : code);
      return;
    }

    case "blockquote": {
      const inner: string[] = [];
      writeBlocks(element, options, inner);
      const text = inner.join("\n\n");
      if (text) {
        into.push(
          options.markdown
            ? text.split("\n").map((line) => `> ${line}`.trimEnd()).join("\n")
            : text
        );
      }
      return;
    }

    case "ul":
    case "ol": {
      const lines: string[] = [];
      let number = 1;

      for (const child of element.children) {
        if (!isElement(child) || child.tag !== "li") continue;

        const inner: string[] = [];
        writeBlocks(child, options, inner);
        const text = inner.join("\n").trim();
        if (!text) continue;

        const marker = element.tag === "ol" ? `${number++}. ` : "- ";
        lines.push(marker + text.replace(/\n/g, `\n${" ".repeat(marker.length)}`));
      }

      if (lines.length) into.push(lines.join("\n"));
      return;
    }

    case "table": {
      const rows = findAll(element, (candidate) => candidate.tag === "tr")
        .map((row) =>
          row.children
            .filter((cell): cell is ElementNode => isElement(cell) && (cell.tag === "td" || cell.tag === "th"))
            .map((cell) => collapse(textOfDecoded(cell)).trim().replace(/\|/g, "/"))
        )
        .filter((cells) => cells.some(Boolean));

      if (rows.length) into.push(rows.map((cells) => cells.join(" | ")).join("\n"));
      return;
    }

    default:
      writeBlocks(element, options, into);
  }
};

const textOfDecoded = (node: PageNode): string =>
  isElement(node)
    ? node.tag === "br"
      ? " "
      : node.children.map(textOfDecoded).join("")
    : decode(node.text);

const metaContent = (root: ElementNode, names: string[]) => {
  for (const meta of findAll(root, (element) => element.tag === "meta")) {
    const name = (meta.attributes.property ?? meta.attributes.name ?? "").toLowerCase();

    if (names.includes(name) && meta.attributes.content?.trim()) {
      return collapse(meta.attributes.content).trim();
    }
  }

  return "";
};

export type ReadablePage = {
  title: string;
  description: string;
  // The main content, as Markdown or plain text
  content: string;
};

/**
 * The main content of a web page, from its HTML.
 */
export const extractReadableContent = (
  html: string,
  {
    format = "markdown",
    baseUrl,
  }: { format?: "markdown" | "text"; baseUrl?: string } = {}
): ReadablePage => {
  const root = parseHtml(html);

  // Read before the <head> is dropped with the rest of the noise
  const titleElement = findAll(root, (element) => element.tag === "title")[0];
  const title =
    metaContent(root, ["og:title", "twitter:title"]) ||
    (titleElement ? collapse(textOfDecoded(titleElement)).trim() : "");
  const description = metaContent(root, ["description", "og:description"]);
  const base =
    resolveUrl(
      findAll(root, (element) => element.tag === "base")[0]?.attributes.href ?? "",
      baseUrl
    ) ?? baseUrl;

  removeNoise(root);

  const blocks: string[] = [];
  writeBlock(findContent(root), { markdown: format === "markdown", baseUrl: base }, blocks);

  return {
    title: title.slice(0, 300),
    description: description.slice(0, 1000),
    content: blocks.join("\n\n").replace(/\n{3,}/g, "\n\n").trim(),
  };
};

export const TRUNCATION_NOTE = "\n\n[The text was cut here: it is longer than the node's Max Characters.]";

/**
 * Cuts a text to a number of characters, at the end of a word where it
 * can, and says so: the reader (often a model) should know there was more.
 */
export const limitText = (
  text: string,
  maxCharacters: number
): { text: string; truncated: boolean } => {
  if (text.length <= maxCharacters) return { text, truncated: false };

  const cut = text.slice(0, maxCharacters);
  const lastSpace = cut.lastIndexOf(" ");
  const clean = lastSpace > maxCharacters * 0.8 ? cut.slice(0, lastSpace) : cut;

  return { text: clean.trimEnd() + TRUNCATION_NOTE, truncated: true };
};

/**
 * A node's "Max Characters" setting as a number within the allowed range.
 */
export const resolveMaxCharacters = (
  value: unknown,
  { fallback, min = 100, max }: { fallback: number; min?: number; max: number }
): number => {
  const number = Math.floor(Number(String(value ?? "").trim()));

  if (!Number.isFinite(number) || number <= 0) return fallback;

  return Math.min(Math.max(number, min), max);
};
