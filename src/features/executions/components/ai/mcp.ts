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
    return this.request<{
      content?: { type: string; text?: string }[];
      structuredContent?: unknown;
      isError?: boolean;
    }>("tools/call", { name, arguments: args ?? {} });
  }
}

const connect = async (data: McpClientData, secret: string, endpoint: string) => {
  const headers = new Headers();
  applyAuthentication(headers, data.authentication || "none", secret);

  const client = new McpHttpClient(endpoint, headers);
  await client.initialize();

  const wanted = (data.includeTools || "")
    .split(",")
    .map((name) => name.trim())
    .filter(Boolean);

  const tools = (await client.listTools()).filter(
    (tool) => wanted.length === 0 || wanted.includes(tool.name)
  );

  return { client, tools };
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
  const { client, tools } = await connect(data, secret, resolveEndpoint(data, context));
  const toolSet: ToolSet = {};

  for (const mcpTool of tools) {
    const name = uniqueToolName(sanitizeToolName(mcpTool.name), takenNames);

    toolSet[name] = dynamicTool({
      description: mcpTool.description || `MCP tool ${mcpTool.name}`,
      inputSchema: jsonSchema(
        (mcpTool.inputSchema as any) ?? { type: "object", properties: {} }
      ),
      execute: async (input: unknown) => {
        try {
          const result = await client.callTool(mcpTool.name, input);

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
      const { tools } = await connect(data, secret, endpoint);

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
