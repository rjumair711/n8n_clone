import { NonRetriableError } from "inngest";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { getAppUrl } from "@/lib/app-url";
import { buildFileDownloadUrl } from "@/lib/file-links";
import { NotFoundError } from "@/lib/ownership";
import { BlockedRequestError, assertPublicUrl } from "@/lib/ssrf";
import { FILE_RETENTION_DAYS, getOwnedWorkflowFile } from "@/lib/workflow-files";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import {
  DEFAULT_REPLY_TYPE,
  GRAPH_API_VERSION,
  GRAPH_ORIGINS,
  INSTAGRAM_MAX_CAPTION,
  INSTAGRAM_MAX_TEXT,
  INSTAGRAM_REPLY_TYPES,
  MESSENGER_MAX_TEXT,
  MESSENGER_REPLY_TYPES,
} from "../../lib/meta-options";
import { resolveFileId } from "../files/executors";

// Messenger, Instagram direct messages, and photo posts on a Facebook Page
// or an Instagram account. All of it is Meta's Graph API: each operation is
// first turned into a plain call (host, path, body) by a function that
// touches nothing, so what would be sent can be tested; one sender then
// makes the call with the token in a header.

type MetaData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

export type GraphCall = {
  // https://graph.facebook.com or https://graph.instagram.com
  origin: string;
  method: "GET" | "POST";
  // After the API version, starting with "/"
  path: string;
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};

type Channel = "messenger" | "instagram";

const LABELS: Record<Channel, string> = {
  messenger: "Messenger",
  instagram: "Instagram",
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown) =>
  typeof value === "string" ? value : typeof value === "number" ? String(value) : "";

const createReader = (label: string, data: MetaData, context: WorkflowContext) => {
  const field = (name: string) => renderTemplate(data[name], context).trim();

  const required = (name: string, title: string) => {
    const value = field(name);
    if (!value) {
      throw new NonRetriableError(`${label} node: ${title} is required`);
    }
    return value;
  };

  // A Page's or an Instagram account's id goes into the address. Empty
  // means the account the token belongs to.
  const account = (name: string, title: string) => {
    const value = field(name) || "me";
    if (!/^(me|\d{5,30})$/.test(value)) {
      throw new NonRetriableError(
        `${label} node: ${title} must be the account's numeric ID, or empty for the account the credential belongs to`
      );
    }
    return value;
  };

  return { field, required, account };
};

// "facebook" unless the node says the account uses Instagram Login
const connectionOf = (data: MetaData) =>
  data.connection === "instagram" ? "instagram" : "facebook";

// =========================================================================
// MESSAGES (Messenger and Instagram direct messages)
// =========================================================================
const MESSAGE_SETTINGS = {
  messenger: {
    maxText: MESSENGER_MAX_TEXT,
    replyTypes: MESSENGER_REPLY_TYPES,
    accountField: ["pageId", "Page ID"],
  },
  instagram: {
    maxText: INSTAGRAM_MAX_TEXT,
    replyTypes: INSTAGRAM_REPLY_TYPES,
    accountField: ["accountId", "Account ID"],
  },
} as const;

const MESSAGE_OPERATIONS = ["send_message", "send_image"];

/**
 * The call that sends a message. `imageUrl` is the address Meta fetches the
 * picture from, for the Send Image operation.
 */
export const buildMessageCall = (
  channel: Channel,
  data: MetaData,
  context: WorkflowContext,
  imageUrl?: string
): GraphCall => {
  const label = LABELS[channel];
  const settings = MESSAGE_SETTINGS[channel];
  const read = createReader(label, data, context);
  const operation = data.operation || "send_message";

  if (!MESSAGE_OPERATIONS.includes(operation)) {
    throw new NonRetriableError(`${label} node: Unsupported operation "${operation}"`);
  }

  const account = read.account(settings.accountField[0], settings.accountField[1]);

  // The id Meta gave for this person in a webhook: {{messenger.from}}
  const recipient = read.required("recipientId", "Recipient ID");
  if (!/^\d{5,30}$/.test(recipient)) {
    throw new NonRetriableError(
      `${label} node: Recipient ID must be the number Meta gave for this person, for example {{${channel}.from}}. A user name or phone number does not work.`
    );
  }

  const replyType = data.replyType || DEFAULT_REPLY_TYPE;
  if (!settings.replyTypes.some((type) => type.value === replyType)) {
    throw new NonRetriableError(`${label} node: Unsupported message type "${replyType}"`);
  }

  let message: Record<string, unknown>;

  if (operation === "send_image") {
    read.required("image", "Image");

    message = {
      attachment: {
        type: "image",
        payload: { url: imageUrl ?? "", ...(channel === "messenger" ? { is_reusable: false } : {}) },
      },
    };
  } else {
    const body = read.required("message", "Message");

    if (body.length > settings.maxText) {
      throw new NonRetriableError(
        `${label} node: the message has ${body.length} characters; ${label} takes at most ${settings.maxText} in one message`
      );
    }

    message = { text: body };
  }

  return {
    origin: GRAPH_ORIGINS[channel === "instagram" ? connectionOf(data) : "facebook"],
    method: "POST",
    path: `/${account}/messages`,
    body: {
      recipient: { id: recipient },
      ...(replyType !== DEFAULT_REPLY_TYPE
        ? { messaging_type: "MESSAGE_TAG", tag: replyType }
        : channel === "messenger"
          ? { messaging_type: "RESPONSE" }
          : {}),
      message,
    },
  };
};

// =========================================================================
// PHOTO POSTS
// =========================================================================
export const POST_OPERATIONS = ["instagram_photo", "facebook_photo"];

const POST_LABEL = "Instagram / Facebook Post";

const readCaption = (data: MetaData, context: WorkflowContext, max?: number) => {
  const caption = renderTemplate(data.caption, context).trim();

  if (max && caption.length > max) {
    throw new NonRetriableError(
      `${POST_LABEL} node: the caption has ${caption.length} characters; Instagram takes at most ${max}`
    );
  }

  return caption;
};

/**
 * A photo on a Facebook Page: one call, with the picture's address.
 */
export const buildFacebookPhotoCall = (
  data: MetaData,
  context: WorkflowContext,
  imageUrl: string
): GraphCall => {
  const read = createReader(POST_LABEL, data, context);
  const caption = readCaption(data, context);

  read.required("image", "Image");

  return {
    origin: GRAPH_ORIGINS.facebook,
    method: "POST",
    path: `/${read.account("pageId", "Page ID")}/photos`,
    body: { url: imageUrl, ...(caption ? { caption } : {}) },
  };
};

/**
 * A photo on Instagram takes two calls: a container is made from the
 * picture's address and the caption, then the container is published.
 * `accountId` is the Instagram account's id (or "me" with Instagram Login).
 */
export const buildInstagramPhotoCalls = (
  data: MetaData,
  context: WorkflowContext,
  { accountId, imageUrl }: { accountId: string; imageUrl: string }
) => {
  const read = createReader(POST_LABEL, data, context);
  const caption = readCaption(data, context, INSTAGRAM_MAX_CAPTION);
  const origin = GRAPH_ORIGINS[connectionOf(data)];

  read.required("image", "Image");

  return {
    container: {
      origin,
      method: "POST",
      path: `/${accountId}/media`,
      body: { image_url: imageUrl, ...(caption ? { caption } : {}) },
    } satisfies GraphCall,
    status: (containerId: string): GraphCall => ({
      origin,
      method: "GET",
      path: `/${containerId}`,
      query: { fields: "status_code,status" },
    }),
    publish: (containerId: string): GraphCall => ({
      origin,
      method: "POST",
      path: `/${accountId}/media_publish`,
      body: { creation_id: containerId },
    }),
    permalink: (mediaId: string): GraphCall => ({
      origin,
      method: "GET",
      path: `/${mediaId}`,
      query: { fields: "permalink" },
    }),
  };
};

// With a Page token "me" is the Page, not its Instagram account
const instagramAccountLookup: GraphCall = {
  origin: GRAPH_ORIGINS.facebook,
  method: "GET",
  path: "/me",
  query: { fields: "instagram_business_account" },
};

// =========================================================================
// THE PICTURE
// =========================================================================
/**
 * Meta does not take uploads for these calls: it fetches the picture from a
 * web address. A public https address is passed on as it is. A file
 * variable becomes the file's signed download link, which works for 15
 * minutes; that needs this app to be reachable from the internet.
 */
export const resolveImageUrl = async ({
  label,
  value,
  context,
  userId,
  jpegOnly = false,
}: {
  label: string;
  value: string | undefined;
  context: WorkflowContext;
  userId: string;
  jpegOnly?: boolean;
}): Promise<string> => {
  const rendered = renderTemplate(value, context).trim();

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rendered)) {
    if (!/^https:\/\//i.test(rendered)) {
      throw new NonRetriableError(`${label} node: the image address must start with https://`);
    }

    // Meta fetches it, not this server. It is checked all the same: a
    // workflow must not be a way to point someone else's crawler at a
    // private address.
    await assertPublicUrl(rendered);

    return rendered;
  }

  const fileId = resolveFileId(label, context, value);

  let file: Awaited<ReturnType<typeof getOwnedWorkflowFile>>;
  try {
    file = await getOwnedWorkflowFile(fileId, userId);
  } catch (error) {
    if (!(error instanceof NotFoundError)) throw error;

    throw new NonRetriableError(
      `${label} node: the file was not found. Files are removed after ${FILE_RETENTION_DAYS} days.`
    );
  }

  const mimeType = file.mimeType.split(";")[0].trim().toLowerCase();

  if (jpegOnly ? mimeType !== "image/jpeg" : !mimeType.startsWith("image/")) {
    throw new NonRetriableError(
      jpegOnly
        ? `${label} node: Instagram only publishes JPEG pictures, and "${file.fileName}" is ${mimeType || "of an unknown type"}`
        : `${label} node: "${file.fileName}" is not a picture (${mimeType || "unknown type"})`
    );
  }

  const appUrl = getAppUrl();

  if (!/^https:\/\//i.test(appUrl) || /^https:\/\/(localhost|127\.|\[::1\])/i.test(appUrl)) {
    throw new NonRetriableError(
      `${label} node: Meta fetches the picture from this app, so NEXT_PUBLIC_APP_URL has to be a public https address. Use a public image address instead, or run the workflow on the deployed app.`
    );
  }

  return buildFileDownloadUrl(appUrl, file.id);
};

// =========================================================================
// SENDING
// =========================================================================
const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Makes a Graph API call. The token goes in a header, never in the address.
 */
export const sendGraphRequest = async ({
  label,
  call,
  token,
}: {
  label: string;
  call: GraphCall;
  token: string;
}): Promise<any> => {
  const url = new URL(`${call.origin}/${GRAPH_API_VERSION}${call.path}`);

  for (const [name, value] of Object.entries(call.query ?? {})) {
    url.searchParams.set(name, value);
  }

  let response: Response;
  try {
    response = await fetch(url, {
      method: call.method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(call.body ? { "Content-Type": "application/json" } : {}),
      },
      body: call.body ? JSON.stringify(call.body) : undefined,
      // Meta's API does not redirect; a token is not sent on to somewhere else
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: any) {
    throw new NonRetriableError(
      error?.name === "TimeoutError"
        ? `${label} node failed: Meta did not answer in time`
        : `${label} node failed: Meta could not be reached`
    );
  }

  const raw = await response.text();

  let payload: any = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    // Not JSON: reported below
  }

  if (!response.ok || isRecord(payload?.error)) {
    const error = isRecord(payload?.error) ? payload.error : {};
    const code = text(error.code);

    throw new NonRetriableError(
      `${label} API error [${response.status}]: ${
        text(error.error_user_msg) || text(error.message) || response.statusText || "the request failed"
      }${code ? ` (code ${code})` : ""}`
    );
  }

  return isRecord(payload) ? payload : {};
};

const toMetaError = (label: string, error: any): NonRetriableError => {
  if (error instanceof NonRetriableError) return error;

  if (error instanceof BlockedRequestError) {
    return new NonRetriableError(`${label} node: ${error.message}`);
  }

  return new NonRetriableError(`${label} node failed: ${error?.message || "unknown error"}`);
};

const createMessageExecutor =
  (channel: Channel): NodeExecutor<MetaData> =>
  async ({ data, nodeId, userId, context, step }) => {
    const label = LABELS[channel];
    const variableName = data.variableName?.trim() || channel;
    const operation = data.operation || "send_message";

    // Every check of the fields comes before the credential is read
    buildMessageCall(channel, data, context);

    const token = await loadCredentialSecret({
      step,
      stepId: `${channel}-${nodeId}-get-credential`,
      credentialId: data.credentialId,
      userId,
      label,
    });

    try {
      const result = await step.run(`${channel}-${nodeId}-${operation}`, async () => {
        const imageUrl =
          operation === "send_image"
            ? await resolveImageUrl({ label, value: data.image, context, userId })
            : undefined;

        const response = await sendGraphRequest({
          label,
          call: buildMessageCall(channel, data, context, imageUrl),
          token,
        });

        return {
          messageId: text(response.message_id),
          recipientId: text(response.recipient_id),
        };
      });

      return { ...context, [variableName]: result };
    } catch (error) {
      throw toMetaError(label, error);
    }
  };

/**
 * Sends a text or a picture to someone who wrote to a Facebook Page.
 */
export const messengerExecutor = createMessageExecutor("messenger");

/**
 * Sends a text or a picture as an Instagram direct message.
 */
export const instagramExecutor = createMessageExecutor("instagram");

// How long a new Instagram container is waited for. A picture is usually
// ready at once.
const CONTAINER_CHECKS = 10;
const CONTAINER_CHECK_MS = 2000;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Publishes a photo with a caption on an Instagram account or a Facebook
 * Page.
 */
export const socialPostExecutor: NodeExecutor<MetaData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const label = POST_LABEL;
  const variableName = data.variableName?.trim() || "post";
  const operation = data.operation || POST_OPERATIONS[0];

  if (!POST_OPERATIONS.includes(operation)) {
    throw new NonRetriableError(`${label} node: Unsupported operation "${operation}"`);
  }

  const read = createReader(label, data, context);
  const placeholder = { accountId: "me", imageUrl: "" };

  // Every check of the fields comes before the credential is read
  if (operation === "facebook_photo") {
    buildFacebookPhotoCall(data, context, placeholder.imageUrl);
  } else {
    read.account("accountId", "Instagram Account ID");
    buildInstagramPhotoCalls(data, context, placeholder);
  }

  const token = await loadCredentialSecret({
    step,
    stepId: `social-post-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label,
  });

  try {
    if (operation === "facebook_photo") {
      const result = await step.run(`social-post-${nodeId}-facebook`, async () => {
        const imageUrl = await resolveImageUrl({ label, value: data.image, context, userId });

        const response = await sendGraphRequest({
          label,
          call: buildFacebookPhotoCall(data, context, imageUrl),
          token,
        });

        const postId = text(response.post_id);

        return {
          platform: "facebook",
          id: text(response.id),
          postId,
          url: postId ? `https://www.facebook.com/${postId}` : "",
        };
      });

      return { ...context, [variableName]: result };
    }

    // Two steps, so that a retry after the picture was published cannot
    // publish it a second time: a container is only published once
    const container = await step.run(`social-post-${nodeId}-instagram-container`, async () => {
      let accountId = read.account("accountId", "Instagram Account ID");

      if (accountId === "me" && connectionOf(data) === "facebook") {
        const page = await sendGraphRequest({ label, call: instagramAccountLookup, token });
        accountId = isRecord(page.instagram_business_account)
          ? text(page.instagram_business_account.id)
          : "";

        if (!/^\d{5,30}$/.test(accountId)) {
          throw new NonRetriableError(
            `${label} node: this Page has no Instagram professional account connected to it (or the token lacks the instagram_basic permission). Connect one in the Page's settings, or type the Instagram Account ID.`
          );
        }
      }

      const imageUrl = await resolveImageUrl({
        label,
        value: data.image,
        context,
        userId,
        jpegOnly: true,
      });

      const created = await sendGraphRequest({
        label,
        call: buildInstagramPhotoCalls(data, context, { accountId, imageUrl }).container,
        token,
      });

      const containerId = text(created.id);
      if (!/^\d{5,30}$/.test(containerId)) {
        throw new NonRetriableError(`${label} node: Instagram did not accept the picture`);
      }

      return { accountId, containerId };
    });

    const result = await step.run(`social-post-${nodeId}-instagram-publish`, async () => {
      const calls = buildInstagramPhotoCalls(data, context, {
        accountId: container.accountId,
        imageUrl: "",
      });

      for (let check = 0; check < CONTAINER_CHECKS; check++) {
        const state = await sendGraphRequest({
          label,
          call: calls.status(container.containerId),
          token,
        });
        const status = text(state.status_code);

        if (status === "ERROR" || status === "EXPIRED") {
          throw new NonRetriableError(
            `${label} node: Instagram could not use the picture${text(state.status) ? ` (${text(state.status)})` : ""}. It has to be a JPEG that Instagram can download, between 4:5 and 1.91:1 in shape.`
          );
        }

        // Anything else than "still working on it" goes on to publishing,
        // which says what is wrong if something is
        if (status !== "IN_PROGRESS") break;

        if (check === CONTAINER_CHECKS - 1) {
          throw new NonRetriableError(
            `${label} node: Instagram was still preparing the picture after ${(CONTAINER_CHECKS * CONTAINER_CHECK_MS) / 1000} seconds`
          );
        }

        await wait(CONTAINER_CHECK_MS);
      }

      const published = await sendGraphRequest({
        label,
        call: calls.publish(container.containerId),
        token,
      });
      const id = text(published.id);

      // The link is a convenience: the post is published without it
      const media = id
        ? await sendGraphRequest({ label, call: calls.permalink(id), token }).catch(() => ({}))
        : {};

      return {
        platform: "instagram",
        id,
        accountId: container.accountId,
        url: text(media.permalink),
      };
    });

    return { ...context, [variableName]: result };
  } catch (error) {
    throw toMetaError(label, error);
  }
};
