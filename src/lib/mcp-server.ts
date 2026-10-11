// The MCP server a workflow becomes through its MCP Server Trigger nodes.
// Each trigger node is one tool. This file is the protocol and the rules,
// with no database and no network, so all of it can be tested: the route
// (src/app/api/mcp/[id]/route.ts) checks the token and runs the workflow.
//
// Transport: Streamable HTTP, without sessions. A client POSTs one JSON-RPC
// message (or a batch) and gets the answer as JSON in the same response.

export const MCP_PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

// JSON-RPC error codes
export const MCP_ERRORS = {
    parse: -32700,
    invalidRequest: -32600,
    methodNotFound: -32601,
    invalidParams: -32602,
    internal: -32603,
} as const;

// A token shorter than this is not accepted as protection for an endpoint
// that runs a workflow
export const MCP_MIN_TOKEN_LENGTH = 16;

export const MCP_MAX_RESULT_CHARACTERS = 100_000;

const TOOL_NAME = /^[A-Za-z0-9_-]{1,64}$/;

const PARAMETER_TYPES: Record<string, string> = {
    string: "string",
    text: "string",
    number: "number",
    integer: "integer",
    boolean: "boolean",
    list: "array",
    array: "array",
    object: "object",
};

export type McpToolSchema = {
    type: "object";
    properties: Record<string, Record<string, unknown>>;
    required?: string[];
    [key: string]: unknown;
};

export type McpServerTool = {
    // The trigger node the tool belongs to: its branch is the one that runs
    nodeId: string;
    name: string;
    description: string;
    inputSchema: McpToolSchema;
    // A variable of the finished run to return instead of everything
    resultPath: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown) => (typeof value === "string" ? value : "");

// =========================================================================
// TOOLS
// =========================================================================
/**
 * "Look up order" -> "look_up_order": what a tool is called on the wire.
 * Empty when nothing usable is left.
 */
export const normalizeToolName = (value: unknown): string =>
    text(value)
        .trim()
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);

/**
 * A tool's parameters, one per line:
 *
 *   orderId (string): The order number, like 1001
 *   includeItems (boolean, optional): Also return the line items
 *
 * The type defaults to string, and a parameter is required unless it says
 * optional. Returns the JSON Schema an MCP client is shown.
 */
export const parseToolParameters = (value: unknown): McpToolSchema => {
    const properties: McpToolSchema["properties"] = {};
    const required: string[] = [];

    for (const line of text(value).split(/\r?\n/)) {
        const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(?:\(([^)]*)\))?\s*(?::\s*(.*))?$/.exec(line);
        if (!match) continue;

        const [, name, options = "", description = ""] = match;
        const words = options
            .toLowerCase()
            .split(/[,\s]+/)
            .filter(Boolean);
        const type = words.map((word) => PARAMETER_TYPES[word]).find(Boolean) ?? "string";

        properties[name] = {
            type,
            ...(description.trim() ? { description: description.trim() } : {}),
        };

        if (!words.includes("optional")) required.push(name);
    }

    return {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
    };
};

/**
 * The input schema of a tool: the JSON Schema typed in under Input Schema
 * when there is one and it describes an object, otherwise the Parameters.
 */
export const readToolSchema = (data: Record<string, unknown>): McpToolSchema => {
    const json = text(data.inputSchema).trim();

    if (json) {
        try {
            const schema: unknown = JSON.parse(json);

            if (isRecord(schema) && schema.type === "object") {
                return {
                    ...schema,
                    type: "object",
                    properties: isRecord(schema.properties)
                        ? (schema.properties as McpToolSchema["properties"])
                        : {},
                    ...(Array.isArray(schema.required)
                        ? { required: schema.required.filter((name) => typeof name === "string") }
                        : {}),
                };
            }
        } catch {
            // Not JSON: the Parameters are used
        }
    }

    return parseToolParameters(data.parameters);
};

/**
 * The tools of a workflow, from its MCP Server Trigger nodes. A node
 * without a usable name is left out, and of two with the same name the
 * first is kept.
 */
export const readMcpTools = (
    nodes: { id: string; data: unknown }[]
): McpServerTool[] => {
    const tools: McpServerTool[] = [];
    const taken = new Set<string>();

    for (const node of nodes) {
        const data = isRecord(node.data) ? node.data : {};
        const name = normalizeToolName(data.toolName);

        if (!TOOL_NAME.test(name) || taken.has(name)) continue;
        taken.add(name);

        tools.push({
            nodeId: node.id,
            name,
            description: text(data.toolDescription).trim(),
            inputSchema: readToolSchema(data),
            resultPath: text(data.resultPath).trim(),
        });
    }

    return tools;
};

const typeOf = (value: unknown) =>
    Array.isArray(value)
        ? "array"
        : value === null
          ? "null"
          : typeof value === "number" && Number.isInteger(value)
            ? "integer"
            : typeof value;

/**
 * Checks a call's arguments against the tool's schema as far as its first
 * level: required parameters are there, and each declared one has its type.
 * Null when they are fine, otherwise what is wrong, in words a model can
 * act on. Parameters the schema does not name are let through.
 */
export const validateToolArguments = (
    schema: McpToolSchema,
    args: unknown
): string | null => {
    if (!isRecord(args)) return "The arguments must be an object";

    const missing = (schema.required ?? []).filter(
        (name) => args[name] === undefined || args[name] === null
    );

    if (missing.length) {
        return `Missing required parameter${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`;
    }

    for (const [name, definition] of Object.entries(schema.properties)) {
        const value = args[name];
        const wanted = isRecord(definition) ? definition.type : undefined;

        if (value === undefined || value === null || typeof wanted !== "string") continue;

        const actual = typeOf(value);
        const fits = wanted === actual || (wanted === "number" && actual === "integer");

        if (!fits) {
            return `Parameter "${name}" must be ${wanted === "array" ? "a list" : `of type ${wanted}`}, not ${actual}`;
        }
    }

    return null;
};

// =========================================================================
// RESULTS
// =========================================================================
export type McpToolResult = {
    content: { type: "text"; text: string }[];
    isError?: boolean;
};

export const toToolResult = (value: unknown, isError = false): McpToolResult => {
    const full =
        typeof value === "string" ? value : JSON.stringify(value ?? null, null, 2);

    return {
        content: [
            {
                type: "text",
                text:
                    full.length > MCP_MAX_RESULT_CHARACTERS
                        ? `${full.slice(0, MCP_MAX_RESULT_CHARACTERS)}... [truncated]`
                        : full,
            },
        ],
        ...(isError ? { isError: true } : {}),
    };
};

const readPath = (value: unknown, path: string): unknown =>
    path
        .split(".")
        .map((part) => part.trim())
        .filter(Boolean)
        .reduce<unknown>(
            (current, key) =>
                isRecord(current) || Array.isArray(current)
                    ? (current as Record<string, unknown>)[key]
                    : undefined,
            value
        );

// What the run was started with and what the engine keeps for itself: not
// part of an answer
const INTERNAL_KEYS = new Set(["mcp", "mcpToolMatched"]);

export type FinishedRun = {
    // "SUCCESS" | "FAILED" | "WAITING" | "RUNNING"
    status: string;
    executionId: string;
    error?: string | null;
    // The run's final data, when the workflow saves it
    output?: unknown;
    // What a Respond to Webhook node answered
    responseBody?: string | null;
    hasResponse?: boolean;
};

/**
 * What a tool call returns for a run.
 *
 *   - A Respond to Webhook node's body, when one ran: the workflow decides
 *     exactly what the caller gets.
 *   - Otherwise the variable named in the trigger's Result field, or
 *     everything the run produced.
 *   - A failed run is an error result, so the calling model can see why.
 */
export const describeRunResult = (run: FinishedRun, resultPath: string): McpToolResult => {
    if (run.hasResponse) {
        return toToolResult(run.responseBody ?? "");
    }

    if (run.status === "FAILED") {
        return toToolResult(
            `The workflow failed: ${(run.error || "unknown error").slice(0, 2000)}`,
            true
        );
    }

    if (run.status === "WAITING") {
        return toToolResult(
            `The workflow is paused at a Wait or approval step and will continue later (execution ${run.executionId}). No result is available yet.`
        );
    }

    if (run.status !== "SUCCESS") {
        return toToolResult(
            `The workflow is still running (execution ${run.executionId}). No result is available yet.`,
            true
        );
    }

    if (!isRecord(run.output)) {
        return toToolResult(
            `The workflow finished (execution ${run.executionId}). It is set not to save its output: add a Respond to Webhook node to return a result.`
        );
    }

    const data = Object.fromEntries(
        Object.entries(run.output).filter(([key]) => !INTERNAL_KEYS.has(key))
    );

    if (!resultPath) return toToolResult(data);

    const value = readPath(data, resultPath);

    return value === undefined
        ? toToolResult(
              `The workflow finished, but it has no value at "${resultPath}" (the trigger's Result field).`,
              true
          )
        : toToolResult(value);
};

// =========================================================================
// PROTOCOL
// =========================================================================
type JsonRpcId = string | number;

export type JsonRpcResponse =
    | { jsonrpc: "2.0"; id: JsonRpcId | null; result: unknown }
    | { jsonrpc: "2.0"; id: JsonRpcId | null; error: { code: number; message: string } };

export const rpcError = (
    id: JsonRpcId | null,
    code: number,
    message: string
): JsonRpcResponse => ({ jsonrpc: "2.0", id, error: { code, message } });

const rpcResult = (id: JsonRpcId, result: unknown): JsonRpcResponse => ({
    jsonrpc: "2.0",
    id,
    result,
});

export type McpServerOptions = {
    // Shown to the client as the server's name
    name: string;
    tools: McpServerTool[];
    // Runs the workflow for a tool and returns what the caller gets
    callTool: (tool: McpServerTool, args: Record<string, unknown>) => Promise<McpToolResult>;
};

/**
 * Answers one JSON-RPC message. Null for a notification (a message without
 * an id), which gets no answer.
 */
export const handleMcpMessage = async (
    message: unknown,
    server: McpServerOptions
): Promise<JsonRpcResponse | null> => {
    if (!isRecord(message) || message.jsonrpc !== "2.0" || typeof message.method !== "string") {
        const id = isRecord(message) && (typeof message.id === "string" || typeof message.id === "number")
            ? message.id
            : null;

        // A response sent to the server (to a request it never made) is ignored
        if (isRecord(message) && message.method === undefined && ("result" in message || "error" in message)) {
            return null;
        }

        return rpcError(id, MCP_ERRORS.invalidRequest, "Not a JSON-RPC 2.0 request");
    }

    const { method } = message;
    const params = isRecord(message.params) ? message.params : {};

    // Notifications: "notifications/initialized", "notifications/cancelled"
    if (typeof message.id !== "string" && typeof message.id !== "number") return null;

    const id = message.id;

    switch (method) {
        case "initialize": {
            const requested = text(params.protocolVersion);

            return rpcResult(id, {
                // The client's version when this server speaks it, otherwise
                // the newest one it does
                protocolVersion: MCP_PROTOCOL_VERSIONS.includes(requested)
                    ? requested
                    : MCP_PROTOCOL_VERSIONS[0],
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: server.name.slice(0, 100) || "RXJ workflow", version: "1.0.0" },
            });
        }

        case "ping":
            return rpcResult(id, {});

        case "tools/list":
            return rpcResult(id, {
                tools: server.tools.map((tool) => ({
                    name: tool.name,
                    description: tool.description || `Runs the "${tool.name}" workflow tool`,
                    inputSchema: tool.inputSchema,
                })),
            });

        case "tools/call": {
            const tool = server.tools.find((candidate) => candidate.name === params.name);

            if (!tool) {
                return rpcError(id, MCP_ERRORS.invalidParams, `Unknown tool: ${text(params.name).slice(0, 100) || "(no name)"}`);
            }

            const args = params.arguments ?? {};
            const problem = validateToolArguments(tool.inputSchema, args);

            // Told as a tool result, not a protocol error: the model that
            // made the call can read it and try again
            if (problem) return rpcResult(id, toToolResult(problem, true));

            try {
                return rpcResult(id, await server.callTool(tool, args as Record<string, unknown>));
            } catch {
                // Nothing of the failure is passed on: it may hold internals
                return rpcResult(id, toToolResult("The tool could not be run. Try again later.", true));
            }
        }

        // Asked by some clients although the server did not offer them
        case "resources/list":
            return rpcResult(id, { resources: [] });
        case "prompts/list":
            return rpcResult(id, { prompts: [] });

        default:
            return rpcError(id, MCP_ERRORS.methodNotFound, `Method not found: ${method.slice(0, 100)}`);
    }
};

/**
 * Answers a request body: one message, or a batch of them. `status` 202
 * with no body when nothing in it wanted an answer.
 */
export const handleMcpBody = async (
    body: unknown,
    server: McpServerOptions
): Promise<{ status: number; body: JsonRpcResponse | JsonRpcResponse[] | null }> => {
    if (Array.isArray(body)) {
        if (body.length === 0 || body.length > 20) {
            return {
                status: 400,
                body: rpcError(null, MCP_ERRORS.invalidRequest, "A batch must have between 1 and 20 messages"),
            };
        }

        const answers: JsonRpcResponse[] = [];
        // One after the other: each tool call is a run of the workflow
        for (const message of body) {
            const answer = await handleMcpMessage(message, server);
            if (answer) answers.push(answer);
        }

        return answers.length ? { status: 200, body: answers } : { status: 202, body: null };
    }

    const answer = await handleMcpMessage(body, server);

    return answer ? { status: 200, body: answer } : { status: 202, body: null };
};

/**
 * The bearer token of a request: "Authorization: Bearer <token>". Empty
 * when there is none.
 */
export const readBearerToken = (header: string | null | undefined): string =>
    /^Bearer\s+(\S+)\s*$/i.exec(header ?? "")?.[1] ?? "";
