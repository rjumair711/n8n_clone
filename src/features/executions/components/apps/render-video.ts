import { NonRetriableError } from "inngest";
import type { NodeExecutor, WorkflowContext } from "@/features/executions/types";
import { safeFetch } from "@/lib/ssrf";
import { MAX_FILE_BYTES, saveWorkflowFile } from "@/lib/workflow-files";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret, parseJsonField } from "../../lib/integration";

// The Render Video node: a finished video (a Reel, a Short, a YouTube
// video) from a template or a JSON description, rendered by Creatomate or
// JSON2Video with the customer's own API key. Rendering takes minutes, so
// the run checks on it in steps that sleep in between.

type RenderData = {
  variableName?: string;
  credentialId?: string;
  // "creatomate" or "json2video"
  operation?: string;
  [key: string]: string | undefined;
};

const LABEL = "Render Video";
export const RENDER_PROVIDERS = ["creatomate", "json2video"];

// Up to 80 checks, 15 seconds apart: 20 minutes
export const RENDER_CHECKS = 80;
const RENDER_CHECK_SLEEP = "15s";
// As an AI Agent's tool: in place, 5 seconds apart, for a minute
const INLINE_CHECKS = 12;
const INLINE_CHECK_MS = 5000;
const REQUEST_TIMEOUT_MS = 30_000;

const CREATOMATE_API = "https://api.creatomate.com/v1";
const JSON2VIDEO_API = "https://api.json2video.com/v2";

const fail = (message: string) => new NonRetriableError(`${LABEL} node: ${message}`);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

/**
 * "name: value" lines into an object. The name is split off first, so a
 * value with colons or {{expressions}} stays whole. Values that are JSON
 * (numbers, true/false, lists) stay text: both services take text.
 */
export const parseValueLines = (text: string | undefined, context: WorkflowContext, title: string) => {
  const values: Record<string, string> = {};
  for (const line of (text ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const colon = line.indexOf(":");
    const name = colon === -1 ? "" : line.slice(0, colon).trim();
    if (!name) throw fail(`${title}: "${line.trim().slice(0, 60)}" must be "name: value"`);
    values[name] = renderTemplate(line.slice(colon + 1).trim(), context);
  }
  return values;
};

const jsonObject = (data: RenderData, name: string, title: string, context: WorkflowContext) => {
  const text = renderTemplate(data[name], context).trim();
  if (!text) throw fail(`${title} is required`);
  const parsed = parseJsonField<unknown>(LABEL, title, text);
  if (!isRecord(parsed)) throw fail(`${title} must be a JSON object`);
  return parsed;
};

export type RenderRequest = { url: string; body: Record<string, unknown> };

/** What is sent to start the render. Pure: nothing is sent here. */
export const buildRenderRequest = (data: RenderData, context: WorkflowContext): RenderRequest => {
  const provider = data.operation || "creatomate";
  if (!RENDER_PROVIDERS.includes(provider)) throw fail(`Unsupported provider "${provider}"`);
  const field = (name: string) => renderTemplate(data[name], context).trim();
  const mode = data.mode === "json" ? "json" : "template";

  if (provider === "creatomate") {
    if (mode === "json") {
      return { url: `${CREATOMATE_API}/renders`, body: { source: jsonObject(data, "sourceJson", "Video JSON", context) } };
    }
    const templateId = field("templateId");
    if (!/^[0-9a-f-]{36}$/i.test(templateId)) {
      throw fail("Template ID must be the template's id from Creatomate (Use template > API Integration), like 8a4b2c1d-...");
    }
    return {
      url: `${CREATOMATE_API}/renders`,
      body: { template_id: templateId, modifications: parseValueLines(data.values, context, "Template Values") },
    };
  }

  // JSON2Video
  if (mode === "json") {
    const movie = jsonObject(data, "sourceJson", "Movie JSON", context);
    if (!Array.isArray(movie.scenes) || movie.scenes.length === 0) {
      throw fail("the Movie JSON needs a \"scenes\" list (see json2video.com/docs)");
    }
    return { url: `${JSON2VIDEO_API}/movies`, body: movie };
  }
  const templateId = field("templateId");
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(templateId)) throw fail("Template ID must be the template's id from JSON2Video");
  return {
    url: `${JSON2VIDEO_API}/movies`,
    body: { template: templateId, variables: parseValueLines(data.values, context, "Template Values") },
  };
};

export type RenderState = { status: "working" | "done" | "failed"; url: string; detail: string; id: string };

/** What a status answer says, the same for both services. */
export const readRenderState = (provider: string, payload: unknown): RenderState => {
  if (provider === "creatomate") {
    // POST answers with a list of renders, GET with one
    const render = (Array.isArray(payload) ? payload[0] : payload) as Record<string, unknown> | undefined;
    const status = String(render?.status ?? "");
    return {
      id: String(render?.id ?? ""),
      status: status === "succeeded" ? "done" : status === "failed" ? "failed" : "working",
      url: String(render?.url ?? ""),
      detail: String(render?.error_message ?? ""),
    };
  }

  const answer = (payload ?? {}) as Record<string, any>;
  const movie = isRecord(answer.movie) ? answer.movie : {};
  const status = String(movie.status ?? "");
  return {
    id: String(answer.project ?? movie.project ?? ""),
    status:
      answer.success === false || status === "error" ? "failed" : status === "done" ? "done" : "working",
    url: String(movie.url ?? ""),
    detail: String(movie.message ?? answer.message ?? ""),
  };
};

const headersFor = (provider: string, key: string): Record<string, string> =>
  provider === "creatomate"
    ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
    : { "x-api-key": key, "Content-Type": "application/json" };

const callService = async (provider: string, key: string, url: string, init: { method: string; body?: unknown }) => {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method,
      headers: headersFor(provider, key),
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error: any) {
    throw fail(error?.name === "TimeoutError" ? "the service did not answer in time" : "the service could not be reached");
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = String((payload as any)?.message ?? (payload as any)?.hint ?? response.statusText);
    throw fail(
      response.status === 401 || response.status === 403
        ? `the API key was refused (${message}). Check the credential.`
        : response.status === 402 || /credit|quota|balance/i.test(message)
          ? `${message}. The account has no render credits left.`
          : `${provider === "creatomate" ? "Creatomate" : "JSON2Video"} API error [${response.status}]: ${message}`
    );
  }
  return payload;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Renders a video with Creatomate or JSON2Video and waits until it is ready.
 */
export const renderVideoExecutor: NodeExecutor<RenderData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
  inline,
  executionId,
}) => {
  const variableName = data.variableName?.trim() || "video";
  const provider = data.operation || "creatomate";

  // Every check of the fields comes before the credential is read
  const request = buildRenderRequest(data, context);

  const key = (
    await loadCredentialSecret({
      step,
      stepId: `render-${nodeId}-get-credential`,
      credentialId: data.credentialId,
      userId,
      label: LABEL,
    })
  ).trim();

  // Started once: a retry never pays for a second render
  const started = await step.run(`render-${nodeId}-start`, async () => {
    const state = readRenderState(provider, await callService(provider, key, request.url, { method: "POST", body: request.body }));
    if (state.status === "failed") throw fail(`the render was refused${state.detail ? `: ${state.detail}` : ""}`);
    if (!state.id) throw fail("the service did not say which render it started");
    return state;
  });

  let state: RenderState = started;
  const checks = inline ? INLINE_CHECKS : RENDER_CHECKS;
  for (let check = 0; state.status === "working"; check++) {
    if (check >= checks) {
      throw fail(
        `the video was still rendering after ${inline ? "a minute" : "20 minutes"}. It goes on at the service; its id is ${started.id}.`
      );
    }
    if (inline) await wait(INLINE_CHECK_MS);
    else await step.sleep(`render-${nodeId}-wait-${check}`, RENDER_CHECK_SLEEP);

    state = await step.run(`render-${nodeId}-check-${check}`, async () =>
      readRenderState(
        provider,
        await callService(
          provider,
          key,
          provider === "creatomate"
            ? `${CREATOMATE_API}/renders/${encodeURIComponent(started.id)}`
            : `${JSON2VIDEO_API}/movies?project=${encodeURIComponent(started.id)}`,
          { method: "GET" }
        )
      )
    );
  }

  if (state.status === "failed") throw fail(`the render failed${state.detail ? `: ${state.detail}` : ""}`);
  if (!/^https:\/\//i.test(state.url)) throw fail("the render finished without a video address");

  // Optionally also a workflow file, when it fits
  const file =
    data.saveAsFile === "true"
      ? await step.run(`render-${nodeId}-save`, async () => {
          const response = await safeFetch(state.url, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok) throw fail(`the video could not be downloaded (HTTP ${response.status})`);
          const size = Number(response.headers.get("content-length") || 0);
          if (size > MAX_FILE_BYTES) {
            await response.body?.cancel().catch(() => {});
            throw fail(
              `the video is ${Math.ceil(size / (1024 * 1024))} MB; a workflow file is at most ${MAX_FILE_BYTES / (1024 * 1024)} MB. Turn Save As File off and use {{${variableName}.url}}.`
            );
          }
          return saveWorkflowFile({
            label: LABEL,
            userId,
            executionId,
            fileName: `video-${started.id.slice(0, 12)}.mp4`,
            mimeType: response.headers.get("content-type")?.split(";")[0] || "video/mp4",
            data: Buffer.from(await response.arrayBuffer()),
          });
        })
      : undefined;

  return {
    ...context,
    [variableName]: { provider, id: started.id, url: state.url, ...(file ? { file } : {}) },
  };
};
