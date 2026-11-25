import { NonRetriableError } from "inngest";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { BlockedRequestError, safeFetch } from "@/lib/ssrf";
import { loadWorkflowFile } from "@/lib/workflow-files";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret, parseJsonField } from "../../lib/integration";
import { resolveFileId } from "../files/executors";
import { normalizeStoreUrl, sendStoreRequest, type StoreRequest } from "./stores";

// The WordPress node: posts and pages, media, categories and tags through
// the REST API (/wp-json/wp/v2), signed in with an application password.
// Like the store nodes, each operation is first turned into a plain request
// by a function that touches nothing, so what would be sent can be tested.

type WordpressData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

const LABEL = "WordPress";

export const WORDPRESS_DEFAULT_OPERATION = "create_post";
export const WORDPRESS_DEFAULT_LIMIT = 10;
export const WORDPRESS_MAX_LIMIT = 100;

export const WORDPRESS_POST_STATUSES = ["draft", "publish", "pending", "private", "future"];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown) =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

// WordPress gives titles and excerpts as { rendered: "..." }
const rendered = (value: unknown) => (isRecord(value) ? text(value.rendered) : text(value));

const stripTags = (value: string) => value.replace(/<[^>]*>/g, "").trim();

/** What the node returns for a post or a page: the fields people use, and the whole answer. */
export const shapePost = (post: unknown) => {
  const value = isRecord(post) ? post : {};

  return {
    id: value.id ?? null,
    link: text(value.link),
    status: text(value.status),
    type: text(value.type),
    slug: text(value.slug),
    title: stripTags(rendered(value.title)),
    excerpt: stripTags(rendered(value.excerpt)),
    date: text(value.date),
    modified: text(value.modified),
    featuredMedia: value.featured_media ?? null,
    categories: Array.isArray(value.categories) ? value.categories : [],
    tags: Array.isArray(value.tags) ? value.tags : [],
    post: value,
  };
};

const shapeTerm = (term: unknown) => {
  const value = isRecord(term) ? term : {};
  return { id: value.id ?? null, name: text(value.name), slug: text(value.slug), count: value.count ?? 0 };
};

const shapeMedia = (media: unknown) => {
  const value = isRecord(media) ? media : {};
  return {
    id: value.id ?? null,
    url: text(value.source_url),
    link: text(value.link),
    mimeType: text(value.mime_type),
    title: stripTags(rendered(value.title)),
    media: value,
  };
};

const createReader = (data: WordpressData, context: WorkflowContext) => {
  const field = (name: string) => renderTemplate(data[name], context).trim();

  const required = (name: string, title: string) => {
    const value = field(name);
    if (!value) throw new NonRetriableError(`${LABEL} node: ${title} is required`);
    return value;
  };

  // An id goes into the address, so it can only be a number
  const id = (name: string, title: string) => {
    const value = required(name, title);
    if (!/^\d{1,20}$/.test(value)) {
      throw new NonRetriableError(`${LABEL} node: ${title} must be a number, for example 123`);
    }
    return Number(value);
  };

  // "3, 7" -> [3, 7]; empty -> undefined (not sent)
  const idList = (name: string, title: string) => {
    const value = field(name);
    if (!value) return undefined;

    const ids = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    if (!ids.every((entry) => /^\d{1,20}$/.test(entry))) {
      throw new NonRetriableError(
        `${LABEL} node: ${title} must be ids separated by commas, for example 3, 7. List Categories and List Tags show them.`
      );
    }
    return ids.map(Number);
  };

  const limit = () => {
    const count = Math.floor(Number(field("limit")));
    return Number.isFinite(count) && count >= 1 ? Math.min(count, WORDPRESS_MAX_LIMIT) : WORDPRESS_DEFAULT_LIMIT;
  };

  const jsonObject = (name: string, title: string): Record<string, unknown> => {
    const value = field(name);
    if (!value) return {};
    const parsed = parseJsonField<unknown>(LABEL, title, value);
    if (!isRecord(parsed)) throw new NonRetriableError(`${LABEL} node: ${title} must be a JSON object`);
    return parsed;
  };

  return { field, required, id, idList, limit, jsonObject };
};

/** The site's REST address, or a clear error. Only https: the password goes with every request. */
export const wordpressApiBase = (data: WordpressData, context: WorkflowContext) => {
  const site = normalizeStoreUrl(createReader(data, context).required("siteUrl", "Site URL"));
  if (!site) {
    throw new NonRetriableError(
      `${LABEL} node: Site URL must be the site's https address, for example https://blog.example.com`
    );
  }
  return `${site}/wp-json/wp/v2`;
};

// Posts or pages: the same API under another name
const resourceOf = (data: WordpressData) => (data.resource === "pages" ? "pages" : "posts");

/** The fields of a post that were filled in, in WordPress's names. */
const postBody = (read: ReturnType<typeof createReader>, data: WordpressData, creating: boolean) => {
  // Create: draft unless said otherwise. Update: its own setting, empty
  // (leave the status as it is) unless chosen, so an update never
  // unpublishes a post by accident
  const newStatus = read.field("newStatus");
  const status = creating
    ? read.field("status") || "draft"
    : newStatus === "keep"
      ? ""
      : newStatus;
  if (status && !WORDPRESS_POST_STATUSES.includes(status)) {
    throw new NonRetriableError(
      `${LABEL} node: Status must be one of ${WORDPRESS_POST_STATUSES.join(", ")}`
    );
  }

  const date = read.field("date");
  if (date && !Number.isFinite(Date.parse(date))) {
    throw new NonRetriableError(`${LABEL} node: Publish Date must be a date, for example 2026-12-24T09:00:00`);
  }
  if (status === "future" && !date) {
    throw new NonRetriableError(`${LABEL} node: a scheduled post (Status: future) needs a Publish Date`);
  }

  const featured = read.field("featuredMediaId");
  if (featured && !/^\d{1,20}$/.test(featured)) {
    throw new NonRetriableError(`${LABEL} node: Featured Image ID must be a number, for example {{media.id}}`);
  }

  const pages = resourceOf(data) === "pages";
  const body: Record<string, unknown> = {
    ...(read.field("title") ? { title: read.field("title") } : {}),
    ...(read.field("content") ? { content: read.field("content") } : {}),
    ...(read.field("excerpt") ? { excerpt: read.field("excerpt") } : {}),
    ...(read.field("slug") ? { slug: read.field("slug") } : {}),
    ...(status ? { status } : {}),
    ...(date ? { date } : {}),
    ...(featured ? { featured_media: Number(featured) } : {}),
    // Pages have no categories or tags
    ...(!pages && read.idList("categories", "Categories") ? { categories: read.idList("categories", "Categories") } : {}),
    ...(!pages && read.idList("tags", "Tags") ? { tags: read.idList("tags", "Tags") } : {}),
    // Anything else, in WordPress's own field names
    ...read.jsonObject("fieldsJson", "Additional Fields"),
  };

  return body;
};

/**
 * The request for every operation but Upload Media (see buildMediaUpload).
 */
export const buildWordpressRequest = (data: WordpressData, context: WorkflowContext): StoreRequest => {
  const read = createReader(data, context);
  const operation = data.operation || WORDPRESS_DEFAULT_OPERATION;
  const base = wordpressApiBase(data, context);
  const resource = resourceOf(data);

  switch (operation) {
    case "create_post": {
      read.required("title", "Title");
      return {
        method: "POST",
        url: `${base}/${resource}`,
        body: postBody(read, data, true),
        shape: shapePost,
      };
    }

    case "update_post": {
      const id = read.id("postId", "Post ID");
      const body = postBody(read, data, false);
      if (Object.keys(body).length === 0) {
        throw new NonRetriableError(`${LABEL} node: fill in at least one field to update`);
      }
      return { method: "POST", url: `${base}/${resource}/${id}`, body, shape: shapePost };
    }

    case "get_post": {
      const id = read.id("postId", "Post ID");
      return { method: "GET", url: `${base}/${resource}/${id}?context=edit`, shape: shapePost };
    }

    case "list_posts": {
      const url = new URL(`${base}/${resource}`);
      url.searchParams.set("per_page", String(read.limit()));
      url.searchParams.set("orderby", "date");
      url.searchParams.set("order", "desc");
      const search = read.field("search");
      if (search) url.searchParams.set("search", search);
      const status = read.field("listStatus");
      if (status) {
        if (![...WORDPRESS_POST_STATUSES, "any"].includes(status)) {
          throw new NonRetriableError(`${LABEL} node: Status must be any, or one of ${WORDPRESS_POST_STATUSES.join(", ")}`);
        }
        url.searchParams.set("status", status);
      }
      return {
        method: "GET",
        url: url.toString(),
        shape: (response) => {
          const items = (Array.isArray(response) ? response : []).map(shapePost);
          return { items, count: items.length };
        },
      };
    }

    case "list_categories":
    case "list_tags": {
      const url = new URL(`${base}/${operation === "list_tags" ? "tags" : "categories"}`);
      url.searchParams.set("per_page", String(read.limit()));
      const search = read.field("search");
      if (search) url.searchParams.set("search", search);
      return {
        method: "GET",
        url: url.toString(),
        shape: (response) => {
          const items = (Array.isArray(response) ? response : []).map(shapeTerm);
          return { items, count: items.length };
        },
      };
    }

    default:
      throw new NonRetriableError(`${LABEL} node: Unsupported operation "${operation}"`);
  }
};

// A file name in a header: plain characters only, the rest as "_"
export const safeFileName = (name: string) =>
  name.replace(/[^\w.\- ]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 120) || "upload";

/**
 * "username:application password". WordPress shows the password in groups
 * with spaces; it takes it with or without them. A user name may itself
 * have spaces, so only the first colon splits.
 */
export const readWordpressCredential = (secret: string) => {
  const colon = secret.indexOf(":");
  const username = colon > 0 ? secret.slice(0, colon).trim() : "";
  const password = colon > 0 ? secret.slice(colon + 1).replace(/\s+/g, "") : "";

  if (!username || !password) {
    throw new NonRetriableError(
      `${LABEL} node: the credential must look like "your-username:abcd efgh ijkl mnop qrst uvwx" (a user name and an application password)`
    );
  }

  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
};

const REDIRECT_HINT =
  "Use the address the site really answers on as Site URL (with or without www, https).";

// WordPress puts the reason in "message", sometimes with HTML in it
const describeWordpressError = (payload: any): string => {
  const message = typeof payload?.message === "string" ? stripTags(payload.message) : "";
  const code = typeof payload?.code === "string" ? payload.code : "";

  if (code === "rest_cannot_create" || code === "rest_cannot_edit" || code === "rest_forbidden") {
    return `${message} The user of the application password needs the Author or Editor role (Administrator for pages of others).`;
  }
  if (code === "rest_not_logged_in" || code === "incorrect_password" || code === "invalid_username") {
    return `${message} Check the user name and application password. Some hosts remove the Authorization header; then their support has to allow it.`;
  }
  return message;
};

const MEDIA_TIMEOUT_MS = 60_000;

const toWordpressError = (error: any): NonRetriableError => {
  if (error instanceof NonRetriableError) return error;
  if (error instanceof BlockedRequestError) return new NonRetriableError(`${LABEL} node: ${error.message}`);
  return new NonRetriableError(
    error?.name === "TimeoutError"
      ? `${LABEL} node failed: the site did not answer in time`
      : `${LABEL} node failed: ${error?.message}${error?.cause?.message ? ` (${error.cause.message})` : ""}`
  );
};

/**
 * Posts, pages, media, categories and tags of a WordPress site.
 */
export const wordpressExecutor: NodeExecutor<WordpressData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "wordpress";
  const operation = data.operation || WORDPRESS_DEFAULT_OPERATION;
  const uploading = operation === "upload_media";

  // Every check of the fields comes before the credential is read
  const base = wordpressApiBase(data, context);
  const request = uploading ? null : buildWordpressRequest(data, context);
  const fileId = uploading ? resolveFileId(LABEL, context, data.file) : null;
  const read = createReader(data, context);

  const secret = await loadCredentialSecret({
    step,
    stepId: `wordpress-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: LABEL,
  });
  const authorization = readWordpressCredential(secret);

  try {
    const result = await step.run(`wordpress-${nodeId}-${operation}`, async () => {
      if (request) {
        const response = await sendStoreRequest({
          label: LABEL,
          request,
          headers: { Authorization: authorization },
          redirectHint: REDIRECT_HINT,
          describeError: describeWordpressError,
        });
        return request.shape(response);
      }

      // Upload Media: the file's bytes as the body, its name in a header
      const file = await loadWorkflowFile(LABEL, fileId!, userId);
      const response = await safeFetch(`${base}/media`, {
        method: "POST",
        headers: {
          Accept: "application/json",
          Authorization: authorization,
          "Content-Type": file.reference.mimeType || "application/octet-stream",
          "Content-Disposition": `attachment; filename="${safeFileName(file.reference.fileName)}"`,
        },
        body: new Uint8Array(file.data),
        redirect: "manual",
        signal: AbortSignal.timeout(MEDIA_TIMEOUT_MS),
      });

      if (response.status >= 300 && response.status < 400) {
        await response.body?.cancel().catch(() => {});
        throw new NonRetriableError(`${LABEL} node: the site redirected the request. ${REDIRECT_HINT}`);
      }

      const raw = await response.text();
      let payload: any = null;
      try {
        payload = raw ? JSON.parse(raw) : null;
      } catch {
        // Not JSON: reported below
      }
      if (!response.ok) {
        throw new NonRetriableError(
          `${LABEL} API error [${response.status}]: ${describeWordpressError(payload) || response.statusText}`
        );
      }

      // Title and alt text are set on the new item in a second call
      const title = read.field("mediaTitle");
      const altText = read.field("altText");
      if (payload?.id && (title || altText)) {
        payload = await sendStoreRequest({
          label: LABEL,
          request: {
            method: "POST",
            url: `${base}/media/${payload.id}`,
            body: { ...(title ? { title } : {}), ...(altText ? { alt_text: altText } : {}) },
          },
          headers: { Authorization: authorization },
          redirectHint: REDIRECT_HINT,
          describeError: describeWordpressError,
        });
      }

      return shapeMedia(payload);
    });

    return { ...context, [variableName]: result };
  } catch (error) {
    throw toWordpressError(error);
  }
};
