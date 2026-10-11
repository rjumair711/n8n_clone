import { dynamicTool, jsonSchema, type ToolSet } from "ai";
import { NonRetriableError } from "inngest";
import { safeFetch } from "@/lib/ssrf";
import type { NodeExecutor } from "@/features/executions/types";
import { renderTemplate } from "../../lib/templates";
import { loadCredentialSecret } from "../../lib/integration";
import { sanitizeToolName, uniqueToolName } from "../../lib/agent-tools";
import { applyAuthentication } from "../http-request/executor";

export type McpClientData = {
  variableName?: string;
  endpoint?: string;
  // "http" (Streamable HTTP, the default) | "sse" (the older HTTP+SSE)
  transport?: string;
  // "none" | "bearer" | "header"
  authentication?: string;
  credentialId?: string;
  // Comma-separated tool names; empty means every tool the server offers
  includeTools?: string;
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

const PROTOCOL_VERSION = "2025-03-26";
// The last version of the protocol that had the HTTP+SSE transport
const SSE_PROTOCOL_VERSION = "2024-11-05";
// The most of an event stream that is kept while an event is incomplete
const MAX_EVENT_BYTES = 2 * 1024 * 1024;

export const MCP_TRANSPORTS = [
  { value: "http", label: "Streamable HTTP" },
  { value: "sse", label: "SSE (older servers)" },
];

export const resolveMcpTransport = (value: unknown): "http" | "sse" =>
  value === "sse" ? "sse" : "http";

type McpToolCallResult = {
  content?: { type: string; text?: string }[];
  structuredContent?: unknown;
  isError?: boolean;
};

// What both transports offer once they are connected
type McpSession = {
  listTools(): Promise<McpTool[]>;
  callTool(name: string, args: unknown): Promise<McpToolCallResult>;
  close(): void;
};
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TOOL_RESULT_CHARS = 20000;

/**
 * A small client for MCP servers that speak the Streamable HTTP transport:
 * JSON-RPC requests are POSTed to one URL and answered as JSON or as a
 * short event stream. Requests go through the SSRF guard because the URL is
 * typed in by the user.
 */
export class McpHttpClient {
  private sessionId: string | null = null;
  private nextId = 1;
  private initialized = false;

  constructor(
    private readonly url: string,
    private readonly headers: Headers
  ) {}

  private async post(body: Record<string, unknown>) {
    const headers = new Headers(this.headers);
    headers.set("Content-Type", "application/json");
    headers.set("Accept", "application/json, text/event-stream");
    if (this.sessionId) headers.set("Mcp-Session-Id", this.sessionId);
    if (this.initialized) headers.set("MCP-Protocol-Version", PROTOCOL_VERSION);

    const response = await safeFetch(this.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    this.sessionId = response.headers.get("mcp-session-id") ?? this.sessionId;

    return response;
  }

  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const response = await this.post({
      jsonrpc: "2.0",
      id,
      method,
      ...(params ? { params } : {}),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `MCP server answered ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`
      );
    }

    // Either one JSON message, or an event stream whose "data:" lines carry
    // JSON messages; the one with our id is the answer
    const messages: any[] = (response.headers.get("content-type") || "").includes(
      "text/event-stream"
    )
      ? text
          .split(/\r?\n\r?\n/)
          .map((event) =>
            event
              .split(/\r?\n/)
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trimStart())
              .join("\n")
          )
          .filter(Boolean)
          .flatMap((data) => {
            try {
              return [JSON.parse(data)];
            } catch {
              return [];
            }
          })
      : [JSON.parse(text)];

    const answer = messages.flat().find((message) => message?.id === id);

    if (!answer) {
      throw new Error(`MCP server sent no answer to "${method}"`);
    }

    if (answer.error) {
      throw new Error(answer.error.message || `MCP error ${answer.error.code}`);
    }

    return answer.result as T;
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "rxj-workflows", version: "1.0.0" },
    });

    this.initialized = true;

    // A notification: no id, no answer expected
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;

    // Servers may page their tool list
    for (let page = 0; page < 10; page++) {
      const result = await this.request<{ tools?: McpTool[]; nextCursor?: string }>(
        "tools/list",
        cursor ? { cursor } : undefined
      );

      tools.push(...(result.tools ?? []));
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    return tools;
  }

  async callTool(name: string, args: unknown) {
    return this.request<McpToolCallResult>("tools/call", { name, arguments: args ?? {} });
  }

  // Nothing stays open between requests
  close() {}
}

/**
 * One event of an event stream: its name ("message" when it has none) and
 * its data lines joined. Null for a block without data (a comment, a ping).
 */
export const parseSseEvent = (block: string): { event: string; data: string } | null => {
  let event = "message";
  const data: string[] = [];

  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim() || "message";
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }

  return data.length ? { event, data: data.join("\n") } : null;
};

/**
 * A client for MCP servers that speak the older HTTP+SSE transport: the
 * client opens an event stream with GET; the server first names the address
 * messages are POSTed to (an "endpoint" event), and every answer then
 * arrives on the stream. Both requests go through the SSRF guard.
 *
 * The stream is a live connection: call close() when done.
 */
export class McpSseClient implements McpSession {
  private readonly controller = new AbortController();
  private readonly pending = new Map<
    number,
    { resolve: (value: unknown) => void; reject: (error: Error) => void }
  >();
  private postUrl: string | null = null;
  private nextId = 1;
  private failure: Error | null = null;
  private onEndpoint: ((url: string) => void) | null = null;

  constructor(
    private readonly url: string,
    private readonly headers: Headers
  ) {}

  async open() {
    const headers = new Headers(this.headers);
    headers.set("Accept", "text/event-stream");

    const response = await safeFetch(this.url, {
      headers,
      signal: this.controller.signal,
    });

    const contentType = response.headers.get("content-type") || "";

    if (!response.ok || !contentType.includes("text/event-stream") || !response.body) {
      await response.body?.cancel().catch(() => {});
      this.controller.abort();

      throw new Error(
        response.ok
          ? "MCP server did not open an event stream at this URL. If it uses Streamable HTTP, change Transport."
          : `MCP server answered ${response.status} ${response.statusText}`
      );
    }

    const endpoint = new Promise<string>((resolve) => {
      this.onEndpoint = resolve;
    });

    void this.read(response.body);

    this.postUrl = await this.within(endpoint, "MCP server did not say where to send messages");
  }

  // A promise that also ends when the stream fails, or after the time limit
  private within<T>(work: Promise<T>, timeoutMessage: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.failure) return reject(this.failure);

      const timer = setTimeout(() => reject(new Error(timeoutMessage)), REQUEST_TIMEOUT_MS);
      const stop = (error: Error) => {
        clearTimeout(timer);
        reject(error);
      };

      this.controller.signal.addEventListener("abort", () => stop(this.failure ?? new Error("MCP connection closed")), { once: true });

      work.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        stop
      );
    });
  }

  private async read(body: ReadableStream<Uint8Array>) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Line ends become "\n". A "\r" at the very end waits for the next
        // chunk: it may be the first half of a "\r\n".
        const held = buffer.endsWith("\r") ? "\r" : "";
        buffer = buffer.slice(0, buffer.length - held.length).replace(/\r\n?/g, "\n") + held;

        let end: number;
        while ((end = buffer.indexOf("\n\n")) !== -1) {
          this.handle(buffer.slice(0, end));
          buffer = buffer.slice(end + 2);
        }

        if (buffer.length > MAX_EVENT_BYTES) {
          throw new Error("MCP server sent an event that is too large");
        }
      }

      this.fail(new Error("MCP server closed the connection"));
    } catch (error: any) {
      this.fail(error instanceof Error ? error : new Error("MCP connection failed"));
    }
  }

  private handle(block: string) {
    const event = parseSseEvent(block);
    if (!event) return;

    if (event.event === "endpoint") {
      let target: URL;
      try {
        target = new URL(event.data.trim(), this.url);
      } catch {
        return this.fail(new Error("MCP server named an address that is not a URL"));
      }

      // The credential is only ever sent back to the server it was for
      if (target.origin !== new URL(this.url).origin) {
        return this.fail(new Error("MCP server asked for messages to be sent to another site"));
      }

      this.onEndpoint?.(target.toString());
      return;
    }

    if (event.event !== "message") return;

    let message: any;
    try {
      message = JSON.parse(event.data);
    } catch {
      return;
    }

    this.settle(message);
  }

  private settle(message: any) {
    const waiting = typeof message?.id === "number" ? this.pending.get(message.id) : undefined;
    if (!waiting) return;

    this.pending.delete(message.id);

    if (message.error) {
      waiting.reject(new Error(message.error.message || `MCP error ${message.error.code}`));
    } else {
      waiting.resolve(message.result);
    }
  }

  private fail(error: Error) {
    if (!this.failure) this.failure = error;

    for (const waiting of this.pending.values()) waiting.reject(this.failure);
    this.pending.clear();

    this.controller.abort();
  }

  private async post(body: Record<string, unknown>) {
    if (!this.postUrl) throw this.failure ?? new Error("MCP connection is not open");

    const headers = new Headers(this.headers);
    headers.set("Content-Type", "application/json");

    const response = await safeFetch(this.postUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `MCP server answered ${response.status} ${response.statusText}${text ? `: ${text.slice(0, 300)}` : ""}`
      );
    }

    // The answer comes on the stream; a server that puts it in the POST's
    // own response is understood too
    if ((response.headers.get("content-type") || "").includes("application/json") && text) {
      try {
        this.settle(JSON.parse(text));
      } catch {
        // Not a message
      }
    }
  }

  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;

    const answer = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    // Reported through within(), below
    answer.catch(() => {});

    try {
      await this.post({ jsonrpc: "2.0", id, method, ...(params ? { params } : {}) });

      return (await this.within(answer, `MCP server sent no answer to "${method}"`)) as T;
    } finally {
      this.pending.delete(id);
    }
  }

  async initialize() {
    await this.request("initialize", {
      protocolVersion: SSE_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "rxj-workflows", version: "1.0.0" },
    });

    await this.post({ jsonrpc: "2.0", method: "notifications/initialized" });
  }

  async listTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;

    for (let page = 0; page < 10; page++) {
      const result = await this.request<{ tools?: McpTool[]; nextCursor?: string }>(
        "tools/list",
        cursor ? { cursor } : undefined
      );

      tools.push(...(result.tools ?? []));
      cursor = result.nextCursor;
      if (!cursor) break;
    }

    return tools;
  }

  async callTool(name: string, args: unknown) {
    return this.request<McpToolCallResult>("tools/call", { name, arguments: args ?? {} });
  }

  close() {
    this.fail(new Error("MCP connection closed"));
  }
}

// Connects and does the protocol's handshake, over the node's transport
const openSession = async (
  data: McpClientData,
  secret: string,
  endpoint: string
): Promise<McpSession> => {
  const headers = new Headers();
  applyAuthentication(headers, data.authentication || "none", secret);

  if (resolveMcpTransport(data.transport) === "sse") {
    const client = new McpSseClient(endpoint, headers);

    try {
      await client.open();
      await client.initialize();
    } catch (error) {
      client.close();
      throw error;
    }

    return client;
  }

  const client = new McpHttpClient(endpoint, headers);
  await client.initialize();

  return client;
};

const connect = async (data: McpClientData, secret: string, endpoint: string) => {
  const client = await openSession(data, secret, endpoint);

  const wanted = (data.includeTools || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  try {
    const tools = (await client.listTools()).filter(
      (tool) => wanted.length === 0 || wanted.includes(tool.name)
    );

    return { client, tools };
  } catch (error) {
    client.close();
    throw error;
  }
};

const resolveEndpoint = (data: McpClientData, context: Record<string, unknown>) => {
  const endpoint = renderTemplate(data.endpoint, context).trim();

  if (!/^https?:\/\//i.test(endpoint)) {
    throw new NonRetriableError(
      "MCP Client node: Endpoint must be the server's http(s) URL"
    );
  }

  return endpoint;
};

/**
 * Loads the credential for an MCP Client node (in a step). Empty when the
 * server needs no authentication.
 */
export const loadMcpSecret = async (
  params: Pick<Parameters<NodeExecutor>[0], "step" | "userId"> & {
    nodeId: string;
    data: McpClientData;
  }
) =>
  (params.data.authentication || "none") === "none"
    ? ""
    : loadCredentialSecret({
        step: params.step,
        stepId: `mcp-${params.nodeId}-get-credential`,
        credentialId: params.data.credentialId,
        userId: params.userId,
        label: "MCP Client",
      });

/**
 * Connects to the server and turns each of its tools into a tool the AI
 * Agent can call. Has to run inside the agent's own step: the connection is
 * live and cannot be replayed.
 */
export const buildMcpTools = async ({
  data,
  secret,
  context,
  takenNames,
}: {
  data: McpClientData;
  secret: string;
  context: Record<string, unknown>;
  takenNames: Set<string>;
}): Promise<ToolSet> => {
  const endpoint = resolveEndpoint(data, context);
  const { client, tools } = await connect(data, secret, endpoint);
  const toolSet: ToolSet = {};

  // An SSE connection is a stream that stays open. It is not kept for the
  // whole of the agent's turn: each call opens one and closes it again, so
  // nothing is left open when the agent stops for any reason.
  const perCall = resolveMcpTransport(data.transport) === "sse";
  if (perCall) client.close();

  for (const mcpTool of tools) {
    const name = uniqueToolName(sanitizeToolName(mcpTool.name), takenNames);

    toolSet[name] = dynamicTool({
      description: mcpTool.description || `MCP tool ${mcpTool.name}`,
      inputSchema: jsonSchema(
        (mcpTool.inputSchema as any) ?? { type: "object", properties: {} }
      ),
      execute: async (input: unknown) => {
        let session: McpSession | null = null;

        try {
          session = perCall ? await openSession(data, secret, endpoint) : client;

          const result = await session.callTool(mcpTool.name, input);

          const text =
            (result.content ?? [])
              .filter((part) => part.type === "text" && part.text)
              .map((part) => part.text)
              .join("\n") ||
            (result.structuredContent !== undefined
              ? JSON.stringify(result.structuredContent)
              : "");

          const clipped =
            text.length > MAX_TOOL_RESULT_CHARS
              ? `${text.slice(0, MAX_TOOL_RESULT_CHARS)}... [truncated]`
              : text;

          return result.isError ? { error: clipped || "The tool failed" } : clipped;
        } catch (error: any) {
          // The model sees the failure and can retry or explain it
          return { error: error?.message || "The MCP tool failed to run" };
        } finally {
          if (perCall) session?.close();
        }
      },
    });
  }

  return toolSet;
};

/**
 * Run as a normal step, the node lists what the server offers, which is the
 * quickest way to check the connection. Its real use is on an AI Agent's
 * Tools port.
 */
export const mcpClientExecutor: NodeExecutor<McpClientData> = async ({
  data,
  nodeId,
  userId,
  context,
  step,
}) => {
  const variableName = data.variableName?.trim() || "mcp";
  const endpoint = resolveEndpoint(data, context);
  const secret = await loadMcpSecret({ step, userId, nodeId, data });

  try {
    const result = await step.run(`mcp-${nodeId}-list-tools`, async () => {
      const { client, tools } = await connect(data, secret, endpoint);
      client.close();

      return {
        tools: tools.map((tool) => ({
          name: tool.name,
          description: tool.description ?? "",
        })),
        count: tools.length,
      };
    });

    return { ...context, [variableName]: result };
  } catch (error: any) {
    if (error instanceof NonRetriableError) throw error;

    throw new NonRetriableError(
      `MCP Client node failed: ${error?.message || "unknown error"}${error?.cause?.message ? ` (${error.cause.message})` : ""}`
    );
  }
};
