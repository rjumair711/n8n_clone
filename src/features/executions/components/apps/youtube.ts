import { Readable } from "node:stream";
import { google } from "googleapis";
import { NonRetriableError } from "inngest";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { BlockedRequestError, safeFetch } from "@/lib/ssrf";
import { loadWorkflowFile } from "@/lib/workflow-files";
import { getYoutubeAuth } from "@/lib/youtube-oauth";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import { resolveFileId } from "../files/executors";

// The YouTube node: upload videos, change their details and thumbnail,
// list the channel's videos, read and reply to comments. YouTube Data API
// v3 through googleapis, signed in with a "YouTube channel" credential.

type YoutubeData = {
  variableName?: string;
  credentialId?: string;
  operation?: string;
  [key: string]: string | undefined;
};

const LABEL = "YouTube";
export const YOUTUBE_OPERATIONS = [
  "upload_video",
  "update_video",
  "set_thumbnail",
  "get_video",
  "list_videos",
  "list_comments",
  "reply_comment",
];
export const YOUTUBE_PRIVACY = ["private", "unlisted", "public"];
export const YOUTUBE_MAX_TITLE = 100;
export const YOUTUBE_MAX_DESCRIPTION = 5000;
export const YOUTUBE_MAX_TAGS_CHARS = 500;
// One step may take 300 seconds on the hosted app: an upload has to fit
export const YOUTUBE_MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const UPLOAD_TIMEOUT_MS = 270_000;
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const DEFAULT_LIST = 25;
const MAX_LIST = 50;

const fail = (message: string) => new NonRetriableError(`${LABEL} node: ${message}`);

const reader = (data: YoutubeData, context: WorkflowContext) => (name: string) =>
  renderTemplate(data[name], context).trim();

export type VideoDetails = {
  snippet: { title?: string; description?: string; tags?: string[]; categoryId?: string };
  status: { privacyStatus?: string; publishAt?: string; selfDeclaredMadeForKids?: boolean };
};

/**
 * A video's details from the node's settings, checked against YouTube's
 * rules. `creating`: a title is required and the defaults apply (private,
 * People & Blogs, not made for kids).
 */
export const readVideoDetails = (
  data: YoutubeData,
  context: WorkflowContext,
  creating: boolean,
  now = Date.now()
): VideoDetails => {
  const field = reader(data, context);
  const title = field("title");
  const description = field("description");

  if (creating && !title) throw fail("Title is required");
  if (title.length > YOUTUBE_MAX_TITLE) throw fail(`the title has ${title.length} characters; YouTube takes at most ${YOUTUBE_MAX_TITLE}`);
  if (description.length > YOUTUBE_MAX_DESCRIPTION) {
    throw fail(`the description has ${description.length} characters; YouTube takes at most ${YOUTUBE_MAX_DESCRIPTION}`);
  }
  // YouTube refuses these two in titles and descriptions
  if (/[<>]/.test(title) || /[<>]/.test(description)) throw fail("YouTube does not allow < or > in a title or description");

  const tagText = field("tags");
  const tags = tagText ? tagText.split(",").map((tag) => tag.trim()).filter(Boolean) : undefined;
  if (tags && tags.join(",").length > YOUTUBE_MAX_TAGS_CHARS) {
    throw fail(`the tags have more than ${YOUTUBE_MAX_TAGS_CHARS} characters together`);
  }

  // Category and made-for-kids are set at upload; an update keeps them
  const categoryId = creating ? field("categoryId") || "22" : "";
  if (categoryId && !/^\d{1,3}$/.test(categoryId)) throw fail("Category must be YouTube's category number, for example 22 (People & Blogs)");

  // An update has its own setting, "Leave as it is" by default, so a public
  // video is never made private by accident
  const privacyChoice = creating ? field("privacyStatus") || "private" : field("newPrivacy");
  const privacy = privacyChoice === "keep" ? "" : privacyChoice;
  if (privacy && !YOUTUBE_PRIVACY.includes(privacy)) throw fail(`Privacy must be ${YOUTUBE_PRIVACY.join(", ")}`);

  const publishAtText = field("publishAt");
  let publishAt: string | undefined;
  if (publishAtText) {
    const time = Date.parse(publishAtText);
    if (!Number.isFinite(time)) throw fail("Publish At must be a date and time, for example 2026-12-24T09:00:00+05:00");
    if (time <= now) throw fail("Publish At must be in the future");
    if (privacy && privacy !== "private") throw fail("a scheduled video has to be uploaded as Private: YouTube makes it public at Publish At");
    publishAt = new Date(time).toISOString();
  }

  const kids = creating ? field("madeForKids") : "";

  return {
    snippet: {
      ...(title ? { title } : {}),
      ...(description ? { description } : {}),
      ...(tags ? { tags } : {}),
      ...(categoryId ? { categoryId } : {}),
    },
    status: {
      ...(privacy || publishAt ? { privacyStatus: publishAt ? "private" : privacy } : {}),
      ...(publishAt ? { publishAt } : {}),
      ...(creating || kids ? { selfDeclaredMadeForKids: kids === "true" } : {}),
    },
  };
};

/** A video's id from an id or any of YouTube's addresses. */
export const readVideoId = (value: string) => {
  const text = value.trim();
  const fromUrl =
    text.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/)?.[1];
  const id = fromUrl ?? text;
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw fail("Video ID must be the 11-character id or the video's address");
  return id;
};

// A media source: a workflow file, or a public https address, as a stream
const openMedia = async (
  value: string | undefined,
  context: WorkflowContext,
  userId: string,
  { kind, maxBytes }: { kind: "video" | "image"; maxBytes: number }
): Promise<{ body: Readable; mimeType: string; size: number | null }> => {
  const rendered = renderTemplate(value, context).trim();
  if (!rendered) throw fail(`${kind === "video" ? "Video" : "Thumbnail"} is required`);

  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(rendered)) {
    if (!/^https:\/\//i.test(rendered)) throw fail(`the ${kind} address must start with https://`);
    const response = await safeFetch(rendered, { signal: AbortSignal.timeout(UPLOAD_TIMEOUT_MS) });
    if (!response.ok || !response.body) throw fail(`the ${kind} could not be downloaded (HTTP ${response.status})`);
    const size = Number(response.headers.get("content-length") || 0) || null;
    if (size && size > maxBytes) {
      await response.body.cancel().catch(() => {});
      throw fail(`the ${kind} is ${Math.ceil(size / (1024 * 1024))} MB; at most ${maxBytes / (1024 * 1024)} MB here`);
    }
    const mimeType = (response.headers.get("content-type") || "").split(";")[0].trim() || (kind === "video" ? "video/mp4" : "image/jpeg");
    return { body: Readable.fromWeb(response.body as any), mimeType, size };
  }

  const file = await loadWorkflowFile(LABEL, resolveFileId(LABEL, context, value), userId);
  if (file.data.length > maxBytes) throw fail(`the ${kind} is larger than ${maxBytes / (1024 * 1024)} MB`);
  return { body: Readable.from(file.data), mimeType: file.reference.mimeType, size: file.data.length };
};

// Google's error, with what to do for the usual ones
const describeYoutubeError = (error: any) => {
  const status = error?.code ?? error?.response?.status;
  const reason = String(error?.errors?.[0]?.reason ?? error?.response?.data?.error?.errors?.[0]?.reason ?? "");
  const message = String(error?.response?.data?.error?.message || error?.message || "the request failed");
  if (/invalid_grant/i.test(message)) return `${message}. The YouTube access was removed or expired: press Reconnect on the credential.`;
  if (reason === "quotaExceeded") {
    return "the project's daily YouTube quota is used up (10,000 units; an upload costs 1,600). It resets at midnight Pacific time.";
  }
  if (reason === "uploadLimitExceeded") return "this channel has uploaded as many videos as YouTube allows for today";
  if (reason === "forbidden" && /thumbnail/i.test(message)) return `${message}. Custom thumbnails need a verified channel (youtube.com/verify).`;
  if (status === 403) return `${message}. The credential needs both YouTube permissions: press Reconnect and allow them.`;
  if (status === 404 || reason === "videoNotFound" || reason === "commentNotFound") return "the video or comment was not found on this channel";
  return message;
};

// The answer we keep for a video
const shapeVideo = (video: any) => ({
  id: video?.id ?? "",
  url: video?.id ? `https://www.youtube.com/watch?v=${video.id}` : "",
  title: video?.snippet?.title ?? "",
  description: video?.snippet?.description ?? "",
  tags: video?.snippet?.tags ?? [],
  categoryId: video?.snippet?.categoryId ?? "",
  publishedAt: video?.snippet?.publishedAt ?? null,
  privacyStatus: video?.status?.privacyStatus ?? "",
  publishAt: video?.status?.publishAt ?? null,
  uploadStatus: video?.status?.uploadStatus ?? "",
  views: Number(video?.statistics?.viewCount ?? 0),
  likes: Number(video?.statistics?.likeCount ?? 0),
  comments: Number(video?.statistics?.commentCount ?? 0),
  thumbnail: video?.snippet?.thumbnails?.high?.url ?? video?.snippet?.thumbnails?.default?.url ?? "",
});

const shapeComment = (thread: any) => {
  const top = thread?.snippet?.topLevelComment;
  return {
    // Reply to Comment takes this id
    commentId: top?.id ?? "",
    videoId: thread?.snippet?.videoId ?? "",
    author: top?.snippet?.authorDisplayName ?? "",
    authorChannelId: top?.snippet?.authorChannelId?.value ?? "",
    text: top?.snippet?.textOriginal ?? "",
    likes: Number(top?.snippet?.likeCount ?? 0),
    replies: Number(thread?.snippet?.totalReplyCount ?? 0),
    publishedAt: top?.snippet?.publishedAt ?? null,
  };
};

/**
 * Videos and comments of the connected YouTube channel.
 */
export const youtubeExecutor: NodeExecutor<YoutubeData> = async ({ data, nodeId, userId, context, step }) => {
  const variableName = data.variableName?.trim() || "youtube";
  const operation = data.operation || "upload_video";
  const field = reader(data, context);

  // Every check of the fields comes before the credential is read
  if (!YOUTUBE_OPERATIONS.includes(operation)) throw fail(`Unsupported operation "${operation}"`);
  const details =
    operation === "upload_video" || operation === "update_video"
      ? readVideoDetails(data, context, operation === "upload_video")
      : null;
  const videoId = ["update_video", "set_thumbnail", "get_video"].includes(operation)
    ? readVideoId(field("videoId"))
    : operation === "list_comments" && field("videoId")
      ? readVideoId(field("videoId"))
      : "";
  if (operation === "upload_video" && !field("video")) throw fail("Video is required");
  if (operation === "set_thumbnail" && !field("thumbnail")) throw fail("Thumbnail is required");
  if (operation === "reply_comment") {
    if (!field("commentId")) throw fail("Comment ID is required");
    if (!field("replyText")) throw fail("Reply is required");
  }
  if (operation === "update_video" && details && !Object.keys(details.snippet).length && !Object.keys(details.status).length) {
    throw fail("fill in at least one field to change");
  }
  const count = Math.floor(Number(field("limit")));
  const limit = Number.isFinite(count) && count >= 1 ? Math.min(count, MAX_LIST) : DEFAULT_LIST;

  const secret = await loadCredentialSecret({
    step,
    stepId: `youtube-${nodeId}-get-credential`,
    credentialId: data.credentialId,
    userId,
    label: LABEL,
  });

  try {
    const result = await step.run(`youtube-${nodeId}-${operation}`, async () => {
      const { auth, credential } = getYoutubeAuth(secret);
      const youtube = google.youtube({ version: "v3", auth });

      if (operation === "upload_video") {
        const media = await openMedia(data.video, context, userId, { kind: "video", maxBytes: YOUTUBE_MAX_UPLOAD_BYTES });
        const response = await youtube.videos.insert(
          {
            part: ["snippet", "status"],
            notifySubscribers: data.notifySubscribers !== "false",
            requestBody: details!,
            media: { mimeType: media.mimeType, body: media.body },
          },
          { timeout: UPLOAD_TIMEOUT_MS }
        );
        return { ...shapeVideo(response.data), channelId: credential.channelId };
      }

      if (operation === "update_video") {
        // YouTube replaces the whole snippet: what was not changed is sent as it was
        const current = await youtube.videos.list({ part: ["snippet", "status"], id: [videoId] });
        const video = current.data.items?.[0];
        if (!video) throw fail("the video was not found on this channel");
        const response = await youtube.videos.update({
          part: ["snippet", "status"],
          requestBody: {
            id: videoId,
            snippet: {
              title: video.snippet?.title,
              description: video.snippet?.description,
              tags: video.snippet?.tags,
              categoryId: video.snippet?.categoryId,
              defaultLanguage: video.snippet?.defaultLanguage,
              ...details!.snippet,
            },
            status: {
              privacyStatus: video.status?.privacyStatus,
              publishAt: video.status?.publishAt,
              selfDeclaredMadeForKids: video.status?.selfDeclaredMadeForKids,
              embeddable: video.status?.embeddable,
              license: video.status?.license,
              publicStatsViewable: video.status?.publicStatsViewable,
              ...details!.status,
            },
          },
        });
        return shapeVideo(response.data);
      }

      if (operation === "set_thumbnail") {
        const image = await openMedia(data.thumbnail, context, userId, { kind: "image", maxBytes: THUMBNAIL_MAX_BYTES });
        if (!["image/jpeg", "image/png"].includes(image.mimeType)) throw fail("a thumbnail has to be JPEG or PNG");
        const response = await youtube.thumbnails.set({ videoId, media: { mimeType: image.mimeType, body: image.body } });
        return { videoId, thumbnail: response.data.items?.[0]?.high?.url ?? response.data.items?.[0]?.default?.url ?? "" };
      }

      if (operation === "get_video") {
        const response = await youtube.videos.list({ part: ["snippet", "status", "statistics"], id: [videoId] });
        const video = response.data.items?.[0];
        if (!video) throw fail("the video was not found");
        return shapeVideo(video);
      }

      if (operation === "list_videos") {
        // The channel's uploads playlist: 1 quota unit, where a search costs 100
        const channel = await youtube.channels.list({ part: ["contentDetails"], id: [credential.channelId] });
        const uploads = channel.data.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
        if (!uploads) return { items: [], count: 0 };
        const listed = await youtube.playlistItems.list({ part: ["contentDetails"], playlistId: uploads, maxResults: limit });
        const ids = (listed.data.items ?? []).map((item) => item.contentDetails?.videoId).filter((id): id is string => !!id);
        if (!ids.length) return { items: [], count: 0 };
        const videos = await youtube.videos.list({ part: ["snippet", "status", "statistics"], id: ids });
        const items = (videos.data.items ?? []).map(shapeVideo);
        return { items, count: items.length };
      }

      if (operation === "list_comments") {
        const response = await youtube.commentThreads.list({
          part: ["snippet"],
          ...(videoId ? { videoId } : { allThreadsRelatedToChannelId: credential.channelId }),
          order: "time",
          maxResults: limit,
          textFormat: "plainText",
        });
        const items = (response.data.items ?? []).map(shapeComment);
        return { items, count: items.length };
      }

      // reply_comment
      const response = await youtube.comments.insert({
        part: ["snippet"],
        requestBody: { snippet: { parentId: field("commentId"), textOriginal: field("replyText") } },
      });
      return { replyId: response.data.id ?? "", commentId: field("commentId"), text: response.data.snippet?.textOriginal ?? "" };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;
    if (error instanceof BlockedRequestError) throw fail(error.message);
    throw fail(`YouTube API error: ${describeYoutubeError(error)}`);
  }
};
