import { NonRetriableError } from "inngest";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { BlockedRequestError, safeFetch } from "@/lib/ssrf";
import { loadWorkflowFile } from "@/lib/workflow-files";
import { readLinkedinCredential } from "@/lib/linkedin-oauth";
import {
  LINKEDIN_DEFAULT_API_VERSION,
  LINKEDIN_MAX_TEXT,
  LINKEDIN_ORGANIZATION_SCOPES,
} from "@/lib/linkedin-options";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import { resolveFileId } from "../files/executors";

// The LinkedIn node: a post on the member's profile, or on a Company Page
// they administer, through LinkedIn's Posts API (/rest/posts). Text, a link
// card, or a picture (uploaded through /rest/images first).

type LinkedinData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

const LABEL = "LinkedIn";
const API = "https://api.linkedin.com/rest";
export const LINKEDIN_OPERATIONS = ["create_post", "share_link", "image_post"];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif"];
const REQUEST_TIMEOUT_MS = 30_000;

const fail = (message: string) => new NonRetriableError(`${LABEL} node: ${message}`);

// The characters LinkedIn's post text reads as markup ("little text")
const RESERVED = /[\\|{}@[\]()<>#*_~]/g;

/**
 * The text as LinkedIn has to receive it to show it as written: markup
 * characters escaped, and #words turned into hashtags. Without this, a "(" or
 * an "@" cuts the post short or makes LinkedIn refuse it.
 */
export const toLinkedinText = (value: string) => {
  const parts: string[] = [];
  const hashtag = /#([\p{L}\p{N}_]+)/gu;
  let last = 0;

  for (const match of value.matchAll(hashtag)) {
    const index = match.index ?? 0;
    // Only at the start or after a space or a line break: "C#" is no hashtag
    if (index > 0 && !/\s/.test(value[index - 1])) continue;
    parts.push(value.slice(last, index).replace(RESERVED, "\\$&"));
    parts.push(`{hashtag|\\#|${match[1].replace(RESERVED, "\\$&")}}`);
    last = index + match[0].length;
  }
  parts.push(value.slice(last).replace(RESERVED, "\\$&"));

  return parts.join("");
};

/** Who the post is by: the member, or a Company Page by its number. */
export const linkedinAuthor = (
  data: LinkedinData,
  context: WorkflowContext,
  credential: { personId: string; scopes: string[] }
) => {
  if (data.postAs !== "organization") return `urn:li:person:${credential.personId}`;

  const id = renderTemplate(data.organizationId, context).trim().replace(/^urn:li:organization:/, "");
  if (!/^\d{1,20}$/.test(id)) {
    throw fail("Company Page ID must be the page's number (in its admin address: linkedin.com/company/<number>/admin)");
  }
  if (!LINKEDIN_ORGANIZATION_SCOPES.every((scope) => credential.scopes.includes(scope))) {
    throw fail(
      "posting as a Company Page needs LinkedIn's Community Management API: once LinkedIn has approved your app, set LINKEDIN_ORGANIZATION_POSTS=true on the server and press Reconnect on the credential"
    );
  }
  return `urn:li:organization:${id}`;
};

/**
 * The body of a post. `media` is the image's urn for a picture post.
 */
export const buildLinkedinPost = (
  data: LinkedinData,
  context: WorkflowContext,
  author: string,
  media?: { id: string; altText: string }
) => {
  const operation = data.operation || "create_post";
  if (!LINKEDIN_OPERATIONS.includes(operation)) throw fail(`Unsupported operation "${operation}"`);

  const field = (name: string) => renderTemplate(data[name], context).trim();
  const text = field("text");
  if (operation === "create_post" && !text) throw fail("Text is required");
  if (text.length > LINKEDIN_MAX_TEXT) {
    throw fail(`the text has ${text.length} characters; LinkedIn takes at most ${LINKEDIN_MAX_TEXT}`);
  }

  let content: Record<string, unknown> | undefined;
  if (operation === "share_link") {
    const url = field("linkUrl");
    if (!/^https?:\/\/[^\s]+$/i.test(url)) throw fail("Link must be a web address, https://...");
    const title = field("linkTitle");
    const description = field("linkDescription");
    content = { article: { source: url, ...(title ? { title } : {}), ...(description ? { description } : {}) } };
  }
  if (operation === "image_post") {
    if (!media) throw fail("Image is required");
    content = { media: { id: media.id, ...(media.altText ? { altText: media.altText } : {}) } };
  }

  const visibility = data.visibility === "CONNECTIONS" ? "CONNECTIONS" : "PUBLIC";
  if (visibility === "CONNECTIONS" && author.startsWith("urn:li:organization:")) {
    throw fail("a Company Page post is always public: set Visibility to Anyone");
  }

  return {
    author,
    commentary: toLinkedinText(text),
    visibility,
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    ...(content ? { content } : {}),
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  };
};

/** The address of a post on LinkedIn, from the urn the API answers with. */
export const linkedinPostUrl = (urn: string) => (urn ? `https://www.linkedin.com/feed/update/${urn}/` : "");

const linkedinHeaders = (accessToken: string) => ({
  Authorization: `Bearer ${accessToken}`,
  "LinkedIn-Version": process.env.LINKEDIN_API_VERSION?.trim() || LINKEDIN_DEFAULT_API_VERSION,
  "X-Restli-Protocol-Version": "2.0.0",
});

const describeLinkedinError = (status: number, payload: any) => {
  const message = typeof payload?.message === "string" ? payload.message : "";
  if (status === 401) return `${message || "the sign-in is no longer valid"}. Press Reconnect on the credential.`;
  if (status === 403) {
    return `${message || "not allowed"}. The LinkedIn app needs "Share on LinkedIn" (and for a Company Page the Community Management API), and you must be an admin of the page.`;
  }
  if (status === 426 || /version/i.test(message)) {
    return `${message}. LinkedIn no longer supports API version ${process.env.LINKEDIN_API_VERSION || LINKEDIN_DEFAULT_API_VERSION}: set LINKEDIN_API_VERSION to a recent month (YYYYMM).`;
  }
  if (status === 422 && /duplicate/i.test(message)) return `${message}. LinkedIn refuses the same text twice in a row.`;
  return message || `HTTP ${status}`;
};

const linkedinFetch = async (url: string, init: RequestInit) => {
  try {
    return await fetch(url, { ...init, redirect: "error", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  } catch (error: any) {
    throw fail(error?.name === "TimeoutError" ? "LinkedIn did not answer in time" : "LinkedIn could not be reached");
  }
};

// The picture's bytes: a workflow file, or downloaded from a public address
const loadImage = async (data: LinkedinData, context: WorkflowContext, userId: string) => {
  const value = renderTemplate(data.image, context).trim();
  if (!value) throw fail("Image is required");

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    if (!/^https:\/\//i.test(value)) throw fail("the image address must start with https://");
    const response = await safeFetch(value, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
    if (!response.ok) throw fail(`the image could not be downloaded (HTTP ${response.status})`);
    if (Number(response.headers.get("content-length") || 0) > MAX_IMAGE_BYTES) {
      await response.body?.cancel().catch(() => {});
      throw fail("the image is larger than 8 MB");
    }
    const type = (response.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
    const bytes = Buffer.from(await response.arrayBuffer());
    return { bytes, type };
  }

  const file = await loadWorkflowFile(LABEL, resolveFileId(LABEL, context, data.image), userId);
  return { bytes: file.data, type: (file.reference.mimeType || "").split(";")[0].trim().toLowerCase() };
};

/**
 * Posts on LinkedIn as the signed-in member or one of their Company Pages.
 */
export const linkedinExecutor: NodeExecutor<LinkedinData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "linkedin";
  const operation = data.operation || "create_post";

  // Every check of the fields comes before the credential is read
  buildLinkedinPost(data, context, "urn:li:person:check", operation === "image_post" ? { id: "urn:li:image:check", altText: "" } : undefined);
  if (operation === "image_post" && !renderTemplate(data.image, context).trim()) throw fail("Image is required");

  const secret = await loadCredentialSecret({
    step,
    stepId: `linkedin-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: LABEL,
  });
  const credential = readLinkedinCredential(secret);
  const author = linkedinAuthor(data, context, credential);
  const headers = linkedinHeaders(credential.accessToken);

  try {
    // The picture first, in a step of its own
    const media =
      operation === "image_post"
        ? await step.run(`linkedin-${nodeId}-image`, async () => {
            const image = await loadImage(data, context, userId);
            if (!IMAGE_TYPES.includes(image.type)) throw fail(`the image has to be JPEG, PNG or GIF, not ${image.type || "an unknown type"}`);
            if (image.bytes.length > MAX_IMAGE_BYTES) throw fail("the image is larger than 8 MB");

            const init = await linkedinFetch(`${API}/images?action=initializeUpload`, {
              method: "POST",
              headers: { ...headers, "Content-Type": "application/json" },
              body: JSON.stringify({ initializeUploadRequest: { owner: author } }),
            });
            const initBody = (await init.json().catch(() => ({}))) as any;
            if (!init.ok) throw fail(describeLinkedinError(init.status, initBody));

            const uploadUrl = String(initBody?.value?.uploadUrl ?? "");
            const imageUrn = String(initBody?.value?.image ?? "");
            // The upload goes only to LinkedIn's own servers
            if (!/^https:\/\/[^/]*\.linkedin\.com\//i.test(uploadUrl) || !imageUrn.startsWith("urn:li:image:")) {
              throw fail("LinkedIn did not give an upload address for the image");
            }

            const upload = await linkedinFetch(uploadUrl, {
              method: "PUT",
              headers: { Authorization: headers.Authorization, "Content-Type": image.type },
              body: new Uint8Array(image.bytes),
            });
            if (!upload.ok) throw fail(`the image upload failed (HTTP ${upload.status})`);

            return { id: imageUrn, altText: renderTemplate(data.altText, context).trim() };
          })
        : undefined;

    const result = await step.run(`linkedin-${nodeId}-${operation}`, async () => {
      const response = await linkedinFetch(`${API}/posts`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(buildLinkedinPost(data, context, author, media)),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw fail(`LinkedIn API error [${response.status}]: ${describeLinkedinError(response.status, payload)}`);
      }
      const urn = response.headers.get("x-restli-id") || "";
      return { id: urn, url: linkedinPostUrl(urn), author, ...(media ? { image: media.id } : {}) };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;
    if (error instanceof BlockedRequestError) throw fail(error.message);
    throw fail(error?.message || "the post failed");
  }
};
