// Run with: npx tsx --conditions=react-server src/inngest/__test__/testCoreNodes.ts
// (the flag lets modules marked "server-only" load outside Next.js)
//
// Checks the parts of the new nodes that need no database or Inngest server:
// the SSRF guard, the HTTP Request node against a local server, the list
// operations and the engine's handling of the new trigger types.

import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

process.env.ENCRYPTION_KEY ??= "test-key-for-core-node-tests";

const fakeStep = {
  run: async (_id: string, fn: () => unknown) => fn(),
} as never;

const baseParams = {
  nodeId: "node-1",
  userId: "user-1",
  step: fakeStep,
  allNodes: [],
  connections: [],
};

let passed = 0;
const test = async (name: string, fn: () => unknown) => {
  try {
    await fn();
    passed++;
    console.log(`  ok  ${name}`);
  } catch (error) {
    console.error(`FAIL  ${name}`);
    throw error;
  }
};

const main = async () => {
  const { isBlockedAddress, parsePublicUrl, safeFetch, assertPublicUrl } =
    await import("@/lib/ssrf");
  const listOps = await import("@/features/executions/lib/list-ops");
  const { parseKeyValues } = await import("@/features/executions/lib/key-values");
  const { buildGraph, getStartNodeIds, runWorkflowGraph } = await import(
    "@/inngest/engine"
  );
  const { httpRequestExecutor } = await import(
    "@/features/executions/components/http-request/executor"
  );
  const { mergeExecutor } = await import(
    "@/features/executions/components/merge/executor"
  );

  // ----------------------------------------------------------------- SSRF
  console.log("SSRF guard");

  await test("blocks private, loopback and metadata addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.1.1",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fe80::1",
      "fc00::1",
      "fd12:3456::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "64:ff9b::a00:1",
      "not-an-ip",
    ]) {
      assert.equal(isBlockedAddress(address), true, address);
    }
  });

  await test("allows public addresses", () => {
    for (const address of [
      "8.8.8.8",
      "1.1.1.1",
      "172.32.0.1",
      "172.15.0.1",
      "100.128.0.1",
      "2606:4700:4700::1111",
      "::ffff:8.8.8.8",
    ]) {
      assert.equal(isBlockedAddress(address), false, address);
    }
  });

  await test("rejects local URLs in every spelling", () => {
    for (const url of [
      "http://localhost:3000/",
      "http://127.0.0.1/",
      "http://2130706433/",
      "http://0x7f.1/",
      "http://[::1]/",
      "http://[::ffff:127.0.0.1]/",
      "http://169.254.169.254/latest/meta-data/",
      "http://db.internal/",
      "file:///etc/passwd",
      "ftp://example.com/",
      "not a url",
    ]) {
      assert.throws(() => parsePublicUrl(url), /not allowed|Only http|valid URL/, url);
    }

    assert.equal(parsePublicUrl("https://api.example.com/x").hostname, "api.example.com");
  });

  const requests: { method?: string; url?: string; headers: any; body: string }[] = [];

  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      requests.push({
        method: request.method,
        url: request.url,
        headers: request.headers,
        body,
      });

      if (request.url?.startsWith("/fail")) {
        response.writeHead(500, { "Content-Type": "application/json" });
        response.end(JSON.stringify({ message: "boom" }));
        return;
      }

      response.writeHead(200, { "Content-Type": "application/json" });
      response.end(JSON.stringify({ ok: true, items: [1, 2] }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  const local = `http://127.0.0.1:${port}`;

  await test("safeFetch refuses a server on this machine", async () => {
    await assert.rejects(safeFetch(`${local}/`), /not allowed/);
    await assert.rejects(assertPublicUrl(`${local}/`), /not allowed/);
    assert.equal(requests.length, 0);
  });

  await test("a name that resolves to a private address is refused at connect time", async () => {
    // localtest.me is public DNS that answers 127.0.0.1
    try {
      await safeFetch(`http://localtest.me:${port}/`);
      assert.fail("the request should have been blocked");
    } catch (error: any) {
      const message = `${error.message} ${error.cause?.message ?? ""}`;
      // Without network access the lookup itself fails, which is also a refusal
      assert.match(message, /not allowed|ENOTFOUND|EAI_AGAIN|fetch failed/);
    }
    assert.equal(requests.length, 0);
  });

  await test("the HTTP Request node reports the block as its own error", async () => {
    await assert.rejects(
      httpRequestExecutor({
        ...baseParams,
        context: {},
        data: { variableName: "api", endpoint: `${local}/`, method: "GET" },
      }),
      /HTTP Request node: Requests to private or local addresses are not allowed/
    );
  });

  // ---------------------------------------------------- HTTP REQUEST NODE
  console.log("HTTP Request node (private network allowed for the local test server)");
  process.env.ALLOW_PRIVATE_NETWORK_REQUESTS = "true";

  await test("sends query parameters, headers and a JSON body without escaping", async () => {
    requests.length = 0;

    const result: any = await httpRequestExecutor({
      ...baseParams,
      context: { user: { name: "A&B=C", id: 7 }, tags: ["x", "y"] },
      data: {
        variableName: "api",
        endpoint: `${local}/users?name={{user.name}}`,
        method: "POST",
        queryParams: "page=2\nfilter={{user.name}}",
        headers: "X-Trace: t-{{user.id}}\nAccept: application/json",
        body: '{"id": {{user.id}}, "tags": {{json tags}}}',
      },
    });

    assert.equal(requests.length, 1);
    const url = new URL(requests[0].url!, local);

    // The old node turned & and = into &amp; and &#x3D;
    assert.equal(url.searchParams.get("name"), "A");
    assert.equal(requests[0].url!.includes("&amp;"), false);
    assert.equal(url.searchParams.get("page"), "2");
    assert.equal(url.searchParams.get("filter"), "A&B=C");
    assert.equal(requests[0].headers["x-trace"], "t-7");
    assert.equal(requests[0].headers["content-type"], "application/json");
    assert.deepEqual(JSON.parse(requests[0].body), { id: 7, tags: ["x", "y"] });

    assert.equal(result.api.httpResponse.status, 200);
    assert.deepEqual(result.api.httpResponse.data, { ok: true, items: [1, 2] });
    assert.equal(result.user.id, 7);
  });

  await test("sends form bodies and keeps old nodes (no bodyType) on JSON", async () => {
    requests.length = 0;

    await httpRequestExecutor({
      ...baseParams,
      context: {},
      data: {
        variableName: "api",
        endpoint: `${local}/form`,
        method: "PUT",
        bodyType: "form",
        body: "a=1\nb=two words",
      },
    });

    assert.equal(requests[0].headers["content-type"], "application/x-www-form-urlencoded");
    assert.equal(requests[0].body, "a=1&b=two+words");

    await httpRequestExecutor({
      ...baseParams,
      context: {},
      data: { variableName: "api", endpoint: `${local}/legacy`, method: "POST" },
    });

    assert.equal(requests[1].body, "{}");
  });

  await test("fails on 5xx unless Never Error is on", async () => {
    await assert.rejects(
      httpRequestExecutor({
        ...baseParams,
        context: {},
        data: { variableName: "api", endpoint: `${local}/fail`, method: "GET" },
      }),
      /status 500.*boom/
    );

    const result: any = await httpRequestExecutor({
      ...baseParams,
      context: {},
      data: {
        variableName: "api",
        endpoint: `${local}/fail`,
        method: "GET",
        neverError: true,
      },
    });

    assert.equal(result.api.httpResponse.status, 500);
    assert.deepEqual(result.api.httpResponse.data, { message: "boom" });
  });

  await test("rejects invalid JSON bodies before sending", async () => {
    requests.length = 0;

    await assert.rejects(
      httpRequestExecutor({
        ...baseParams,
        context: {},
        data: {
          variableName: "api",
          endpoint: `${local}/x`,
          method: "POST",
          body: "{not json}",
        },
      }),
      /not valid JSON/
    );

    assert.equal(requests.length, 0);
  });

  delete process.env.ALLOW_PRIVATE_NETWORK_REQUESTS;
  server.close();

  // ------------------------------------------------------------ KEY/VALUES
  console.log("Key/value fields");

  await test("reads lines and JSON objects", () => {
    assert.deepEqual(parseKeyValues("X", "Headers", "A: 1\n\nB: https://x.y/z?a=b"), {
      A: "1",
      B: "https://x.y/z?a=b",
    });
    assert.deepEqual(parseKeyValues("X", "Query", "a=1\nb=c=d"), { a: "1", b: "c=d" });
    assert.deepEqual(parseKeyValues("X", "Query", '{"a": 1, "b": null, "c": {"d": 2}}'), {
      a: "1",
      c: '{"d":2}',
    });
    assert.deepEqual(parseKeyValues("X", "Query", "  "), {});
    assert.throws(() => parseKeyValues("X", "Headers", "no separator"), /could not read/);
  });

  // ------------------------------------------------------------- LIST OPS
  console.log("List operations");

  const orders = [
    { id: 1, customer: "ali", amount: 30, lines: [{ sku: "a" }, { sku: "b" }] },
    { id: 2, customer: "sara", amount: 10, lines: [{ sku: "c" }] },
    { id: 3, customer: "ali", amount: "20", lines: [] },
  ];

  await test("Split Out", () => {
    assert.deepEqual(listOps.splitOut(orders, "lines"), [
      { sku: "a" },
      { sku: "b" },
      { sku: "c" },
    ]);
    assert.deepEqual(listOps.splitOut([orders[1]], "lines", true), [
      { id: 2, customer: "sara", amount: 10, lines: { sku: "c" } },
    ]);
    assert.deepEqual(listOps.splitOut([{ a: { tags: ["x", "y"] } }], "a.tags"), ["x", "y"]);
  });

  await test("Aggregate", () => {
    assert.deepEqual(listOps.aggregate(orders, "field", "customer", ""), {
      customer: ["ali", "sara", "ali"],
    });
    assert.deepEqual(listOps.aggregate([1, 2], "all", "", "numbers"), { numbers: [1, 2] });
  });

  await test("Sort (numbers as numbers, missing values last, stable)", () => {
    assert.deepEqual(
      listOps.sortItems(orders, "amount", "asc").map((order: any) => order.id),
      [2, 3, 1]
    );
    assert.deepEqual(
      listOps.sortItems(orders, "amount", "desc").map((order: any) => order.id),
      [1, 3, 2]
    );
    assert.deepEqual(
      listOps.sortItems([{ n: "b" }, {}, { n: "a" }], "n", "desc"),
      [{ n: "b" }, { n: "a" }, {}]
    );
    assert.deepEqual(listOps.sortItems([10, 9, 100], "", "asc"), [9, 10, 100]);
  });

  await test("Limit", () => {
    assert.deepEqual(listOps.limitItems([1, 2, 3], 2, "first"), [1, 2]);
    assert.deepEqual(listOps.limitItems([1, 2, 3], 2, "last"), [2, 3]);
    assert.deepEqual(listOps.limitItems([1, 2, 3], 0, "last"), []);
  });

  await test("Remove Duplicates", () => {
    assert.deepEqual(
      listOps.removeDuplicates(orders, ["customer"]).map((order: any) => order.id),
      [1, 2]
    );
    assert.deepEqual(
      listOps.removeDuplicates([{ a: 1, b: 2 }, { b: 2, a: 1 }, { a: 2 }], []),
      [{ a: 1, b: 2 }, { a: 2 }]
    );
  });

  await test("Summarize", () => {
    assert.deepEqual(listOps.summarize(orders, "amount", "sum", ["customer"]), [
      { customer: "ali", sum_amount: 50 },
      { customer: "sara", sum_amount: 10 },
    ]);
    assert.deepEqual(listOps.summarize(orders, "", "count", []), [{ count_items: 3 }]);
    assert.deepEqual(listOps.summarize(orders, "amount", "average", []), [
      { average_amount: 20 },
    ]);
    assert.deepEqual(listOps.summarize([], "amount", "max", []), [{ max_amount: null }]);
  });

  await test("Merge combines lists (text and number keys match)", async () => {
    const customers = [
      { id: 1, name: "Ali" },
      { id: 2, name: "Sara" },
    ];
    const payments = [
      { customerId: "1", paid: 5 },
      { customerId: "1", paid: 7 },
      { customerId: "9", paid: 1 },
    ];

    assert.deepEqual(
      listOps.combineLists(customers, payments, "byKey", "id", "customerId"),
      [
        { id: 1, name: "Ali", customerId: "1", paid: 5 },
        { id: 1, name: "Ali", customerId: "1", paid: 7 },
      ]
    );
    assert.equal(listOps.combineLists(customers, payments, "append").length, 5);
    assert.equal(listOps.combineLists(customers, payments, "byPosition").length, 2);

    const result: any = await mergeExecutor({
      ...baseParams,
      context: { a: { items: customers, count: 2 }, b: payments },
      inputs: { active: 2, total: 2 },
      data: { mode: "all", combine: "append", listA: "a", listB: "{{b}}" },
    });

    assert.equal(result.merge.count, 5);
    assert.equal(result.merge.branchesReceived, 2);
  });

  // --------------------------------------------------------------- ENGINE
  console.log("Engine");

  await test("an Error Trigger branch only runs for the error trigger", async () => {
    const graph = buildGraph(
      [
        { id: "hook", type: "WEBHOOK_TRIGGER" },
        { id: "work", type: "HTTP_REQUEST" },
        { id: "onError", type: "ERROR_TRIGGER" },
        { id: "alert", type: "SLACK" },
        { id: "sub", type: "EXECUTE_WORKFLOW_TRIGGER" },
        { id: "subWork", type: "CODE" },
      ],
      [
        { fromNodeId: "hook", toNodeId: "work", fromOutput: "main", toInput: "main" },
        { fromNodeId: "onError", toNodeId: "alert", fromOutput: "main", toInput: "main" },
        { fromNodeId: "sub", toNodeId: "subWork", fromOutput: "main", toInput: "main" },
      ]
    );

    assert.deepEqual(getStartNodeIds(graph, "ERROR_TRIGGER"), ["onError"]);
    assert.deepEqual(getStartNodeIds(graph, "EXECUTE_WORKFLOW_TRIGGER"), ["sub"]);

    const ran: string[] = [];
    await runWorkflowGraph({
      graph,
      trigger: "WEBHOOK_TRIGGER",
      context: {},
      runNode: async (node, context) => {
        ran.push(node.id);
        return context;
      },
    });

    assert.deepEqual(ran, ["hook", "work"]);
  });

  await test("a Chat Model node on the agent's model port is not run as a step", async () => {
    const graph = buildGraph(
      [
        { id: "chat", type: "CHAT_TRIGGER" },
        { id: "agent", type: "AI_AGENT" },
        { id: "model", type: "CHAT_MODEL" },
        { id: "tool", type: "EXECUTE_WORKFLOW" },
      ],
      [
        { fromNodeId: "chat", toNodeId: "agent", fromOutput: "main", toInput: "flow-in" },
        { fromNodeId: "model", toNodeId: "agent", fromOutput: "main", toInput: "sub-model" },
        { fromNodeId: "tool", toNodeId: "agent", fromOutput: "main", toInput: "sub-tools" },
      ]
    );

    assert.deepEqual(graph.order, ["chat", "agent"]);
  });

  // ---------------------------------------------------------- EXPRESSIONS
  console.log("n8n-style expressions");

  const { ensureExpressionEngine } = await import(
    "@/features/executions/lib/expressions"
  );
  const { renderTemplate, renderEscapedTemplate } = await import(
    "@/features/executions/lib/templates"
  );
  const { getValueByPath } = await import("@/features/executions/lib/conditions");
  const { extractAIParameters } = await import(
    "@/features/executions/lib/agent-tools"
  );

  await ensureExpressionEngine();

  const data = {
    user: { name: "Ali", tags: ["a", "b"], age: 30 },
    api: { httpResponse: { data: { id: 7 } } },
    sorted: { items: [{ n: 1 }, { n: 2 }], count: 2 },
    html: "<b>x</b>",
    ai: { city: "Lahore" },
  };

  await test("$json paths, JavaScript and the Handlebars form side by side", () => {
    assert.equal(renderTemplate("Hi {{ $json.user.name }}!", data), "Hi Ali!");
    assert.equal(renderTemplate("{{$json.user.age + 1}}", data), "31");
    assert.equal(
      renderTemplate("{{ $json.user.name.toUpperCase() }} / {{user.name}}", data),
      "ALI / Ali"
    );
    assert.equal(
      renderTemplate('{{ $json.user.tags.map((tag) => tag + "!").join(",") }}', data),
      "a!,b!"
    );
    assert.equal(renderTemplate("{{ $json.user.tags }}", data), '["a","b"]');
    assert.equal(renderTemplate("{{ $json.missing }}", data), "");
    assert.equal(renderTemplate('{"id": {{ $json.api.httpResponse.data.id }}}', data), '{"id": 7}');
  });

  await test("$('node'), $node, $input, $now and $fromAI()", () => {
    assert.equal(renderTemplate("{{ $('api').item.json.httpResponse.data.id }}", data), "7");
    assert.equal(renderTemplate('{{ $node["user"].json.name }}', data), "Ali");
    assert.equal(renderTemplate("{{ $('sorted').all().length }}", data), "2");
    assert.equal(renderTemplate("{{ $('sorted').last().json.n }}", data), "2");
    assert.equal(renderTemplate("{{ $input.first().json.user.age }}", data), "30");
    assert.match(renderTemplate("{{ $now }}", data), /^\d{4}-\d\d-\d\dT/);
    assert.match(renderTemplate("{{ $now.toISO() }}", data), /^\d{4}-\d\d-\d\dT/);
    assert.equal(renderTemplate("{{ $fromAI('city', 'The city') }}", data), "Lahore");
    assert.equal(renderTemplate('{{$fromAI "city"}}', data), "Lahore");
  });

  await test("escaping only applies to the nodes that always escaped", () => {
    assert.equal(renderTemplate("{{ $json.html }}", data), "<b>x</b>");
    assert.equal(renderEscapedTemplate("{{ $json.html }}", data), "&lt;b&gt;x&lt;/b&gt;");
    assert.equal(renderEscapedTemplate("{{html}}", data), "&lt;b&gt;x&lt;/b&gt;");
  });

  await test("expressions are sandboxed and bounded", () => {
    assert.throws(() => renderTemplate("{{ $json.user.nope.deeper }}", data), /Expression .* failed/);
    assert.throws(() => renderTemplate("{{ $json && process.env }}", data), /process/);
    assert.throws(() => renderTemplate("{{ $json && require('fs') }}", data), /require/);
    assert.throws(
      () => renderTemplate("{{ (() => { while (true) {} })($json) }}", data),
      /more than 250ms/
    );
    // Blocks and object literals inside an expression
    assert.equal(
      renderTemplate("{{ $json.user.tags.map((tag) => { return tag.length }).join('+') }}", data),
      "1+1"
    );
    assert.equal(renderTemplate('{{ ({ a: $json.user.age, b: "}}" }) }}', data), '{"a":30,"b":"}}"}');
    assert.equal(renderTemplate("{{{ $json.html }}} and {{json user.tags}}}", { ...data }), '<b>x</b> and [\n  "a",\n  "b"\n]}');
    // The sandbox is thrown away after each render
    assert.equal(renderTemplate("{{ $json.user.name }}", data), "Ali");
  });

  await test("condition paths accept $json and brackets", () => {
    assert.equal(getValueByPath(data, "{{ $json.user.name }}"), "Ali");
    assert.equal(getValueByPath(data, "$json.user.tags[1]"), "b");
    assert.equal(getValueByPath(data, 'sorted.items[0]["n"]'), 1);
    assert.equal(getValueByPath(data, "user.name"), "Ali");
  });

  await test("tool parameters are found in n8n's $fromAI() call form", () => {
    assert.deepEqual(
      extractAIParameters({
        a: "{{ $fromAI('city', 'The city to look up') }}",
        b: '{{ $fromAI("days", "How many days", "number") }}',
        c: '{{$fromAI "unit"}}',
      }),
      [
        { key: "city", description: "The city to look up", type: "string" },
        { key: "days", description: "How many days", type: "number" },
        { key: "unit", description: undefined, type: "string" },
      ]
    );
  });

  // -------------------------------------------------------------- AI NODES
  console.log("AI nodes");

  const aiFields = await import("@/features/executions/lib/ai-fields");

  await test("classifier categories and extractor attributes are parsed", () => {
    assert.deepEqual(aiFields.parseCategories("sales: prices and plans\n\nSupport\nsales"), [
      { id: "category-sales", name: "sales", description: "prices and plans" },
      { id: "category-support", name: "Support", description: "" },
      { id: "category-sales-2", name: "sales", description: "" },
    ]);
    assert.deepEqual(
      aiFields.parseAttributes("name: who wrote it\ntotal (number)\nwhen (Date): delivery day\nplain"),
      [
        { name: "name", type: "string", description: "who wrote it" },
        { name: "total", type: "number", description: "" },
        { name: "when", type: "date", description: "delivery day" },
        { name: "plain", type: "string", description: "" },
      ]
    );
  });

  await test("JSON is found in a model's answer", () => {
    assert.deepEqual(aiFields.extractJson('{"a": 1}'), { a: 1 });
    assert.deepEqual(aiFields.extractJson('```json\n{"a": 1}\n```'), { a: 1 });
    assert.deepEqual(aiFields.extractJson('Sure! Here it is: {"a": {"b": 2}} Hope that helps.'), {
      a: { b: 2 },
    });
    assert.deepEqual(aiFields.extractJson("[1, 2]"), [1, 2]);
    assert.equal(aiFields.extractJson("no json here"), undefined);
  });

  await test("text is split into overlapping chunks", () => {
    assert.deepEqual(aiFields.splitText("short", 1000, 100), ["short"]);

    const text = Array.from({ length: 60 }, (_, index) => "Sentence number " + index + ".").join(" ");
    const chunks = aiFields.splitText(text, 200, 40);

    assert.ok(chunks.length > 4);
    assert.ok(chunks.every((chunk) => chunk.length <= 200));
    // Nothing is lost between chunks
    assert.ok(chunks[0].startsWith("Sentence number 0."));
    assert.ok(chunks[chunks.length - 1].endsWith("Sentence number 59."));
    for (let index = 0; index < 60; index++) {
      assert.ok(chunks.some((chunk) => chunk.includes("Sentence number " + index + ".")), String(index));
    }
  });

  await test("the classifier branches like a Switch and its model is not a step", async () => {
    const graph = buildGraph(
      [
        { id: "start", type: "MANUAL_TRIGGER" },
        { id: "classify", type: "TEXT_CLASSIFIER" },
        { id: "model", type: "OPENAI" },
        { id: "sales", type: "SLACK" },
        { id: "other", type: "DISCORD" },
      ],
      [
        { fromNodeId: "start", toNodeId: "classify", fromOutput: "source-1", toInput: "target-1" },
        { fromNodeId: "model", toNodeId: "classify", fromOutput: "source-1", toInput: "sub-model" },
        { fromNodeId: "classify", toNodeId: "sales", fromOutput: "category-sales", toInput: "target-1" },
        { fromNodeId: "classify", toNodeId: "other", fromOutput: "other", toInput: "target-1" },
      ]
    );

    assert.equal(graph.order.includes("model"), false);

    const ran: string[] = [];
    await runWorkflowGraph({
      graph,
      trigger: "MANUAL_TRIGGER",
      context: {},
      runNode: async (node, context) => {
        ran.push(node.id);
        return node.type === "TEXT_CLASSIFIER"
          ? { ...context, matchedBranch: "category-sales" }
          : context;
      },
    });

    assert.deepEqual(ran, ["start", "classify", "sales"]);
  });

  // ------------------------------------------------------------------ MCP
  console.log("MCP client (private network allowed for the local test server)");
  process.env.ALLOW_PRIVATE_NETWORK_REQUESTS = "true";

  const { McpHttpClient, buildMcpTools } = await import(
    "@/features/executions/components/ai/mcp"
  );

  const mcpCalls: { method: string; session?: string; auth?: string }[] = [];

  const mcpServer = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const message = JSON.parse(body);
      mcpCalls.push({
        method: message.method,
        session: request.headers["mcp-session-id"] as string | undefined,
        auth: request.headers.authorization,
      });

      if (message.id === undefined) {
        response.writeHead(202).end();
        return;
      }

      const results: Record<string, unknown> = {
        initialize: { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "t", version: "1" } },
        "tools/list": {
          tools: [
            {
              name: "add numbers",
              description: "Adds two numbers",
              inputSchema: { type: "object", properties: { a: { type: "number" }, b: { type: "number" } }, required: ["a", "b"] },
            },
            { name: "hidden", inputSchema: { type: "object" } },
          ],
        },
        "tools/call": {
          content: [{ type: "text", text: String((message.params?.arguments?.a ?? 0) + (message.params?.arguments?.b ?? 0)) }],
        },
      };

      const answer = JSON.stringify({ jsonrpc: "2.0", id: message.id, result: results[message.method] });

      // tools/call answers as an event stream, the rest as plain JSON
      if (message.method === "tools/call") {
        response.writeHead(200, { "Content-Type": "text/event-stream" });
        response.end("event: message\ndata: " + answer + "\n\n");
      } else {
        response.writeHead(200, { "Content-Type": "application/json", "Mcp-Session-Id": "session-1" });
        response.end(answer);
      }
    });
  });

  await new Promise<void>((resolve) => mcpServer.listen(0, "127.0.0.1", resolve));
  const mcpUrl = "http://127.0.0.1:" + (mcpServer.address() as AddressInfo).port + "/mcp";

  await test("initializes, lists tools and calls one over JSON and SSE", async () => {
    const client = new McpHttpClient(mcpUrl, new Headers());
    await client.initialize();

    assert.deepEqual((await client.listTools()).map((tool) => tool.name), ["add numbers", "hidden"]);
    assert.deepEqual(await client.callTool("add numbers", { a: 2, b: 3 }), {
      content: [{ type: "text", text: "5" }],
    });

    assert.deepEqual(mcpCalls.map((call) => call.method), [
      "initialize",
      "notifications/initialized",
      "tools/list",
      "tools/call",
    ]);
    // The session id from initialize is sent on every later request
    assert.deepEqual(mcpCalls.map((call) => call.session), [undefined, "session-1", "session-1", "session-1"]);
  });

  await test("server tools become agent tools, filtered and authenticated", async () => {
    mcpCalls.length = 0;

    const tools = await buildMcpTools({
      data: { endpoint: mcpUrl, authentication: "bearer", includeTools: "add numbers" },
      secret: "token-123",
      context: {},
      takenNames: new Set(["add_numbers"]),
    });

    // Sanitized for the model, and made unique next to an existing tool
    assert.deepEqual(Object.keys(tools), ["add_numbers_2"]);
    assert.equal(mcpCalls[0].auth, "Bearer token-123");

    const result = await (tools.add_numbers_2 as any).execute({ a: 20, b: 22 }, { toolCallId: "1", messages: [] });
    assert.equal(result, "42");
  });

  delete process.env.ALLOW_PRIVATE_NETWORK_REQUESTS;
  mcpServer.close();

  // ---------------------------------------------------------------- ITEMS
  console.log("Per-item execution");

  const { runNodeForItems, MAX_ITEMS_PER_NODE } = await import("@/inngest/items");
  const { getActiveOutputs } = await import("@/inngest/engine");
  const { sortExecutor, splitOutExecutor, aggregateExecutor } = await import(
    "@/features/executions/components/data/executors"
  );

  type Ctx = Record<string, any>;
  const edge = (from: string, to: string, fromOutput = "source-1") => ({
    fromNodeId: from,
    toNodeId: to,
    fromOutput,
    toInput: "target-1",
  });

  // Runs a graph the way the engine function does, with stand-in executors
  const runItems = async (
    nodes: { id: string; type: string; data?: Ctx }[],
    edges: ReturnType<typeof edge>[],
    executors: Record<string, (context: Ctx, items: unknown[] | null) => Ctx | Promise<Ctx>>,
    start: Ctx = {}
  ) => {
    const calls: { id: string; context: Ctx; items: unknown[] | null }[] = [];

    const context = await runWorkflowGraph({
      graph: buildGraph(nodes, edges),
      context: start,
      runNode: (node, nodeContext, meta) =>
        runNodeForItems({
          node,
          context: nodeContext,
          items: meta.items,
          getActiveOutputs,
          execute: async (runContext, runItemsList) => {
            calls.push({ id: node.id, context: runContext, items: runItemsList });
            return (await executors[node.id]?.(runContext, runItemsList)) ?? runContext;
          },
        }),
    });

    return {
      context: context as Ctx,
      calls,
      count: (id: string) => calls.filter((call) => call.id === id).length,
    };
  };

  const rows = [
    { id: 1, vip: true },
    { id: 2, vip: false },
    { id: 3, vip: true },
  ];

  await test("nodes after a list node run once per item, routers route each item, Aggregate ends the list", async () => {
    const { context, calls, count } = await runItems(
      [
        { id: "start", type: "MANUAL_TRIGGER" },
        { id: "split", type: "SPLIT_OUT", data: { variableName: "rows" } },
        { id: "fetch", type: "HTTP_REQUEST", data: { variableName: "api" } },
        { id: "check", type: "IF" },
        { id: "vip", type: "SLACK" },
        { id: "normal", type: "DISCORD" },
        { id: "collect", type: "AGGREGATE", data: { variableName: "all" } },
        { id: "report", type: "EMAIL_SEND" },
      ],
      [
        edge("start", "split"),
        edge("split", "fetch"),
        edge("fetch", "check"),
        edge("check", "vip", "true"),
        edge("check", "normal", "false"),
        edge("vip", "collect"),
        edge("collect", "report"),
      ],
      {
        split: (ctx) => ({ ...ctx, rows: { items: rows, count: rows.length } }),
        // The item is the row; the result becomes the next node's item
        fetch: (ctx) => ({ ...ctx, api: { double: ctx.item.id * 2, vip: ctx.item.vip } }),
        check: (ctx) => ({ ...ctx, ifResult: ctx.item.vip, if: { result: ctx.item.vip } }),
        collect: (ctx, items) => ({ ...ctx, all: { data: items } }),
      },
      { webhook: { body: "kept" } }
    );

    assert.equal(count("split"), 1);
    assert.equal(count("fetch"), 3);
    assert.equal(count("check"), 3);
    assert.equal(count("vip"), 2);
    assert.equal(count("normal"), 1);
    assert.equal(count("collect"), 1);
    assert.equal(count("report"), 1);

    // Each run sees its own item, its index and the workflow's variables
    const fetchCalls = calls.filter((call) => call.id === "fetch");
    assert.deepEqual(fetchCalls.map((call) => call.context.item), rows);
    assert.deepEqual(fetchCalls.map((call) => call.context.itemIndex), [0, 1, 2]);
    assert.equal(fetchCalls[0].context.webhook.body, "kept");

    // Paired items: {{api.double}} in a later node belongs to the same item
    const vipCalls = calls.filter((call) => call.id === "vip");
    assert.deepEqual(vipCalls.map((call) => call.context.api.double), [2, 6]);
    assert.deepEqual(calls.find((call) => call.id === "normal")!.context.api, { double: 4, vip: false });

    // Aggregate received the items of the branch that reached it
    assert.deepEqual(calls.find((call) => call.id === "collect")!.items, [
      { double: 2, vip: true },
      { double: 6, vip: true },
    ]);

    // After Aggregate nodes run once again, without an item
    const report = calls.find((call) => call.id === "report")!;
    assert.equal("item" in report.context, false);
    assert.equal(report.items, null);

    // Outside the list a per-item node's variable holds every result
    assert.equal(context.api.count, 3);
    assert.deepEqual(context.api.items.map((entry: Ctx) => entry.double), [2, 4, 6]);
    assert.equal("item" in context, false);
    assert.equal("items" in context, false);
    assert.equal("ifResult" in context, false);
  });

  await test("a Filter that drops every item stops the branch; Limit/Sort keep pairing", async () => {
    const dropped = await runItems(
      [
        { id: "split", type: "SPLIT_OUT", data: { variableName: "rows" } },
        { id: "filter", type: "FILTER" },
        { id: "after", type: "SLACK" },
      ],
      [edge("split", "filter"), edge("filter", "after")],
      {
        split: (ctx) => ({ ...ctx, rows: { items: rows, count: 3 } }),
        filter: (ctx) => ({ ...ctx, filterPassed: false }),
      }
    );
    assert.equal(dropped.count("filter"), 3);
    assert.equal(dropped.count("after"), 0);

    const kept = await runItems(
      [
        { id: "split", type: "SPLIT_OUT", data: { variableName: "rows" } },
        { id: "tag", type: "SET_VARIABLE", data: { variableName: "tag" } },
        { id: "filter", type: "FILTER" },
        { id: "limit", type: "LIMIT", data: { variableName: "limited" } },
        { id: "after", type: "SLACK" },
      ],
      [edge("split", "tag"), edge("tag", "filter"), edge("filter", "limit"), edge("limit", "after")],
      {
        split: (ctx) => ({ ...ctx, rows: { items: rows, count: 3 } }),
        tag: (ctx) => ({ ...ctx, tag: { label: "row-" + ctx.item.id, id: ctx.item.id } }),
        filter: (ctx) => ({ ...ctx, filterPassed: ctx.item.id !== 1 }),
        // Keeps the last of the items that reached it
        limit: (ctx, items) => ({ ...ctx, limited: { items: items!.slice(-1), count: 1 } }),
      }
    );

    assert.equal(kept.count("limit"), 1);
    assert.deepEqual(kept.calls.find((call) => call.id === "limit")!.items!.map((item: any) => item.id), [2, 3]);
    assert.equal(kept.count("after"), 1);
    const after = kept.calls.find((call) => call.id === "after")!;
    assert.equal(after.context.item.label, "row-3");
    // The variable set for that item earlier in the chain is still its own
    assert.equal(after.context.tag.label, "row-3");
  });

  await test("without a list node everything still runs exactly once", async () => {
    const { context, calls } = await runItems(
      [
        { id: "start", type: "MANUAL_TRIGGER" },
        { id: "code", type: "CODE", data: { variableName: "list" } },
        { id: "http", type: "HTTP_REQUEST", data: { variableName: "api" } },
        { id: "if", type: "IF" },
        { id: "yes", type: "SLACK" },
        { id: "no", type: "DISCORD" },
      ],
      [edge("start", "code"), edge("code", "http"), edge("http", "if"), edge("if", "yes", "true"), edge("if", "no", "false")],
      {
        // A Code node returning a list does not start per-item runs
        code: (ctx) => ({ ...ctx, list: [1, 2, 3] }),
        http: (ctx) => ({ ...ctx, api: { ok: true } }),
        if: (ctx) => ({ ...ctx, ifResult: false }),
      }
    );

    assert.deepEqual(calls.map((call) => call.id), ["start", "code", "http", "if", "no"]);
    assert.ok(calls.every((call) => !("item" in call.context) && call.items === null));
    assert.deepEqual(context.api, { ok: true });
    assert.deepEqual(context.list, [1, 2, 3]);
  });

  await test("Execute Once, the per-node item limit and error pass-through", async () => {
    const once = await runItems(
      [
        { id: "split", type: "SPLIT_OUT", data: { variableName: "rows" } },
        { id: "send", type: "SLACK", data: { executeOnce: true } },
      ],
      [edge("split", "send")],
      { split: (ctx) => ({ ...ctx, rows: { items: rows, count: 3 } }) }
    );
    assert.equal(once.count("send"), 1);

    const many = Array.from({ length: MAX_ITEMS_PER_NODE + 1 }, (_, id) => ({ id }));
    await assert.rejects(
      runItems(
        [
          { id: "split", type: "SPLIT_OUT", data: { variableName: "rows" } },
          { id: "send", type: "SLACK" },
        ],
        [edge("split", "send")],
        { split: (ctx) => ({ ...ctx, rows: { items: many, count: many.length } }) }
      ),
      /items reached this node but the limit is/
    );
  });

  await test("the real list nodes read the incoming items and feed each other", async () => {
    const numbers = [{ n: 3 }, { n: 1 }, { n: 2 }];

    const ran: Ctx[] = [];
    const context: Ctx = await runWorkflowGraph({
      graph: buildGraph(
        [
          { id: "split", type: "SPLIT_OUT", data: { variableName: "rows", inputPath: "source", field: "numbers" } },
          { id: "sort", type: "SORT", data: { variableName: "sorted", field: "n", order: "desc" } },
          { id: "use", type: "SET_VARIABLE", data: { variableName: "seen" } },
          { id: "collect", type: "AGGREGATE", data: { variableName: "all", operation: "field", field: "value" } },
        ],
        [edge("split", "sort"), edge("sort", "use"), edge("use", "collect")]
      ),
      context: { source: { numbers } },
      runNode: (node, nodeContext, meta) =>
        runNodeForItems({
          node,
          context: nodeContext,
          items: meta.items,
          getActiveOutputs,
          execute: async (runContext, runItemsList) => {
            const params = { ...baseParams, data: node.data as any, context: runContext, items: runItemsList };

            if (node.type === "SPLIT_OUT") return splitOutExecutor(params);
            if (node.type === "SORT") return sortExecutor(params);
            if (node.type === "AGGREGATE") return aggregateExecutor(params);

            ran.push(runContext);
            return {
              ...runContext,
              // {{ $json.n }} is the item's field inside the list
              seen: { value: Number(renderTemplate("{{ $json.n }}", runContext)) * 10 },
            };
          },
        }),
    });

    // Sort had no Input List: it used the items Split Out sent
    assert.deepEqual(context.sorted.items, [{ n: 3 }, { n: 2 }, { n: 1 }]);
    assert.deepEqual(ran.map((runContext) => runContext.item.n), [3, 2, 1]);
    assert.deepEqual(context.all, { value: [30, 20, 10] });
  });

  await test("expressions and conditions see the item", () => {
    const itemContext = { webhook: { id: 9 }, item: { name: "Ali", total: 5 }, itemIndex: 2, items: undefined };

    assert.equal(renderTemplate("{{ $json.name }} #{{ $itemIndex }} / {{item.total}}", itemContext), "Ali #2 / 5");
    assert.equal(renderTemplate("{{ $input.item.json.total + 1 }}", itemContext), "6");
    // Variables the item does not have are still reachable through $json
    assert.equal(renderTemplate("{{ $json.webhook.id }}", itemContext), "9");
    assert.equal(renderTemplate("{{ $input.all().length }}", { items: [1, 2, 3] }), "3");

    assert.equal(getValueByPath(itemContext, "$json.name"), "Ali");
    assert.equal(getValueByPath(itemContext, "item.total"), 5);
    assert.equal(getValueByPath(itemContext, "$json.webhook.id"), 9);
  });

  // ----------------------------------------------------------- APP NODES
  console.log("App nodes");

  const editFields = await import("@/features/executions/lib/edit-fields");
  const { editFieldsExecutor, twilioExecutor, jiraExecutor, mysqlExecutor } = await import(
    "@/features/executions/components/apps/executors"
  );
  const { assertPublicHost } = await import("@/lib/ssrf");

  await test("Edit Fields reads its lines", () => {
    assert.deepEqual(
      editFields.parseAssignments("name = Ali\n\ntotal (number) = 5\nurl = https://x.y/?a=b\n data.tags (JSON) = [1]"),
      [
        { name: "name", type: "string", value: "Ali" },
        { name: "total", type: "number", value: "5" },
        { name: "url", type: "string", value: "https://x.y/?a=b" },
        { name: "data.tags", type: "json", value: "[1]" },
      ]
    );
    assert.throws(() => editFields.parseAssignments("no separator"), /name = value/);
    assert.throws(() => editFields.parseAssignments("a (date) = 1"), /Unknown type/);
    assert.throws(() => editFields.convertFieldValue("n", "number", "abc"), /not a number/);
    assert.equal(editFields.convertFieldValue("b", "boolean", "Yes"), true);
  });

  await test("Edit Fields sets, keeps, removes and renames without changing its input", () => {
    const input = { id: 1, first_name: "Ali", secret: "x", address: { city: "Lahore", zip: "54000" } };
    const base = { input, fieldList: [] as string[], renames: [], values: [] };

    assert.deepEqual(
      editFields.applyEditFields({
        ...base,
        include: "all",
        renames: [{ from: "first_name", to: "firstName" }],
        values: [
          { name: "address.country", value: "PK" },
          { name: "paid", value: true },
        ],
      }),
      {
        id: 1,
        secret: "x",
        address: { city: "Lahore", zip: "54000", country: "PK" },
        firstName: "Ali",
        paid: true,
      }
    );
    assert.deepEqual(
      editFields.applyEditFields({ ...base, include: "selected", fieldList: ["id", "address.city", "missing"] }),
      { id: 1, address: { city: "Lahore" } }
    );
    assert.deepEqual(
      editFields.applyEditFields({ ...base, include: "except", fieldList: ["secret", "address.zip"] }),
      { id: 1, first_name: "Ali", address: { city: "Lahore" } }
    );
    assert.deepEqual(
      editFields.applyEditFields({ ...base, include: "none", values: [{ name: "only", value: 1 }] }),
      { only: 1 }
    );
    // The input is untouched, and prototype keys are refused
    assert.deepEqual(input.address, { city: "Lahore", zip: "54000" });
    assert.throws(
      () => editFields.applyEditFields({ ...base, include: "all", values: [{ name: "__proto__.x", value: 1 }] }),
      /not a valid field name/
    );
  });

  await test("the Edit Fields node maps each item of a list", async () => {
    const people = [
      { first: "Ali", last: "Khan", price: 2, quantity: 3 },
      { first: "Sara", last: "Malik", price: 5, quantity: 1 },
    ];

    const context: Ctx = await runWorkflowGraph({
      graph: buildGraph(
        [
          { id: "split", type: "SPLIT_OUT", data: { variableName: "rows", inputPath: "people" } },
          {
            id: "edit",
            type: "EDIT_FIELDS",
            data: {
              variableName: "person",
              include: "none",
              assignments: "name = {{item.first}} {{item.last}}\ntotal (number) = {{ $json.price * $json.quantity }}",
            },
          },
        ],
        [edge("split", "edit")]
      ),
      context: { people },
      runNode: (node, nodeContext, meta) =>
        runNodeForItems({
          node,
          context: nodeContext,
          items: meta.items,
          getActiveOutputs,
          execute: (runContext, runItemsList) => {
            const params = { ...baseParams, data: node.data as any, context: runContext, items: runItemsList };
            return node.type === "SPLIT_OUT" ? splitOutExecutor(params) : editFieldsExecutor(params);
          },
        }),
    });

    assert.deepEqual(context.person.items, [
      { name: "Ali Khan", total: 6 },
      { name: "Sara Malik", total: 5 },
    ]);

    // Outside a list it builds one object, from a named input or from nothing
    const single: Ctx = await editFieldsExecutor({
      ...baseParams,
      context: { api: { id: 9, junk: true } },
      data: { variableName: "out", inputPath: "api", include: "except", fieldList: "junk", assignments: "ok (boolean) = true" },
    });
    assert.deepEqual(single.out, { id: 9, ok: true });

    await assert.rejects(
      editFieldsExecutor({ ...baseParams, context: { list: [1] }, data: { variableName: "out", inputPath: "list" } }),
      /add a Split Out node/
    );
  });

  await test("app nodes check their settings before using a credential", async () => {
    await assert.rejects(
      twilioExecutor({ ...baseParams, context: {}, data: { variableName: "t", operation: "send_sms", from: "+1555" } }),
      /Twilio node: To is required/
    );
    await assert.rejects(
      jiraExecutor({ ...baseParams, context: {}, data: { variableName: "j", operation: "create_issue", domain: "bad domain!", projectKey: "A", summary: "s" } }),
      /Domain must look like/
    );
    await assert.rejects(
      mysqlExecutor({ ...baseParams, context: {}, data: { variableName: "m", operation: "insert_row", table: "t", rowJson: "{}" } }),
      /needs at least one column/
    );
    await assert.rejects(
      mysqlExecutor({ ...baseParams, context: {}, data: { variableName: "m", operation: "execute_query", query: "SELECT ?", paramsJson: '{"a":1}' } }),
      /must be a JSON array/
    );
  });

  const sqlExpressions = await import("@/features/executions/lib/sql-expressions");
  const sqlSafety = await import("@/features/executions/lib/sql-safety");
  const { postgresExecutor } = await import(
    "@/features/executions/components/postgres/executor"
  );

  await test("expressions in SQL query text are detected", () => {
    const { hasQueryExpressions } = sqlExpressions;

    for (const query of [
      "SELECT * FROM users WHERE email = '{{webhook.body.email}}'",
      "SELECT * FROM users WHERE id = {{ $json.id }}",
      "SELECT * FROM {{table}} LIMIT 1",
      "DELETE FROM t WHERE id = {{{raw}}}",
      'SELECT {{$fromAI "column" "the column"}} FROM t',
      "SELECT *\nFROM t\nWHERE id = {{\n  $json.items.map((i) => { return i.id })[0]\n}}",
    ]) {
      assert.equal(hasQueryExpressions(query), true, query);
    }

    for (const query of [
      "SELECT * FROM users WHERE email = $1",
      "SELECT * FROM users WHERE email = ? LIMIT 10",
      `SELECT '{"a": {"b": 1}}'::jsonb`,
      "SELECT '{1,2}'::int[], '{}'::text[]",
      "SELECT 'an unclosed {{ is only text'",
      "",
    ]) {
      assert.equal(hasQueryExpressions(query), false, query);
    }
    assert.equal(hasQueryExpressions(undefined), false);

    // On only when it was switched on; nodes saved before it existed are off
    assert.equal(sqlExpressions.allowsQueryExpressions("true"), true);
    assert.equal(sqlExpressions.allowsQueryExpressions(true), true);
    for (const value of [undefined, "", "false", false, "yes", 1]) {
      assert.equal(sqlExpressions.allowsQueryExpressions(value), false);
    }
  });

  await test("a query with expressions in its text is rejected unless the node allows it", async () => {
    const context = { webhook: { body: { email: "x' OR '1'='1", id: 7 } } };
    const query = "SELECT * FROM users WHERE email = '{{webhook.body.email}}'";

    for (const label of ["Postgres", "MySQL"]) {
      assert.throws(
        () => sqlSafety.resolveQueryText(label, { query }, context),
        new RegExp(`${label} node: the query text contains .* expressions.*Query Parameters.*Allow expressions in query text \\(unsafe\\)`)
      );
      assert.throws(
        () => sqlSafety.resolveQueryText(label, { query, allowQueryExpressions: "false" }, context),
        /query text contains/
      );
      // The author's own choice: the text is rendered as before
      assert.equal(
        sqlSafety.resolveQueryText(label, { query, allowQueryExpressions: "true" }, context),
        "SELECT * FROM users WHERE email = 'x' OR '1'='1'"
      );
    }

    // Without expressions the text is sent as written, option or not
    assert.equal(
      sqlSafety.resolveQueryText("Postgres", { query: "  SELECT * FROM users WHERE email = $1  " }, context),
      "SELECT * FROM users WHERE email = $1"
    );
    assert.equal(
      sqlSafety.resolveQueryText("Postgres", { query: "SELECT 'a {{ b'" }, context),
      "SELECT 'a {{ b'"
    );
    assert.throws(() => sqlSafety.resolveQueryText("MySQL", { query: "  " }, context), /Query is required/);

    // Both nodes refuse before they look for a credential or connect
    const data = { variableName: "db", operation: "execute_query", query };
    await assert.rejects(postgresExecutor({ ...baseParams, context, data }), /Postgres node: the query text contains/);
    await assert.rejects(mysqlExecutor({ ...baseParams, context, data }), /MySQL node: the query text contains/);
    // MySQL nodes saved without an operation run Execute Query
    await assert.rejects(
      mysqlExecutor({ ...baseParams, context, data: { variableName: "db", query } }),
      /MySQL node: the query text contains/
    );
    // With the option on they get as far as the missing credential
    await assert.rejects(
      postgresExecutor({ ...baseParams, context, data: { ...data, allowQueryExpressions: "true" } }),
      /Credential is required/
    );
    await assert.rejects(
      mysqlExecutor({ ...baseParams, context, data: { ...data, allowQueryExpressions: "true" } }),
      /Credential is required/
    );
    // The other operations never used the query text
    await assert.rejects(
      postgresExecutor({ ...baseParams, context, data: { ...data, operation: "select_rows", table: "users" } }),
      /Credential is required/
    );
  });

  await test("Query Parameters take expressions and keep each value whole", () => {
    const context = {
      webhook: { body: { email: `a"b'; DROP TABLE users; --`, id: 7, note: "line 1\nline 2" } },
      ids: [1, 2],
    };
    const params = (text?: string) => sqlSafety.resolveQueryParameters("Postgres", text, context);

    assert.deepEqual(params(undefined), []);
    assert.deepEqual(params("  "), []);
    assert.deepEqual(params('[42, "plain", true, null]'), [42, "plain", true, null]);

    // Quotes and line breaks in a value stay inside that one value
    assert.deepEqual(
      params('["{{webhook.body.email}}", "{{ $json.webhook.body.note }}", "id-{{webhook.body.id}}"]'),
      [`a"b'; DROP TABLE users; --`, "line 1\nline 2", "id-7"]
    );
    // Numbers and whole lists, written without quotes
    assert.deepEqual(params("[{{webhook.body.id}}, {{json ids}}]"), [7, [1, 2]]);
    assert.deepEqual(params("{{json ids}}"), [1, 2]);

    assert.throws(() => params('{"a": 1}'), /Query Parameters must be a JSON array/);
    assert.throws(() => params("[{{webhook.body.missing}}"), /Invalid JSON in the Query Parameters field/);
    assert.throws(
      () => sqlSafety.resolveQueryParameters("MySQL", "{{webhook.body.id}}", context),
      /MySQL node: Query Parameters must be a JSON array/
    );
  });

  await test("database hosts on a private network are refused", async () => {
    for (const host of ["localhost", "127.0.0.1", "10.0.0.5", "db.internal", "[::1]", "169.254.169.254"]) {
      await assert.rejects(assertPublicHost(host), /not allowed/, host);
    }
    await assertPublicHost("8.8.8.8");
  });

  // ------------------------------------------------------------------ RSS
  console.log("RSS");

  const { parseFeed } = await import("@/lib/rss");
  const { rssReadExecutor } = await import(
    "@/features/executions/components/apps/executors"
  );

  const rssXml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    "<channel><title>Shop News</title><link>https://shop.example/</link><description>Updates</description>",
    "<item><title>Tom &amp; Jerry sale</title><link>https://shop.example/a</link>",
    '<guid isPermaLink="false">post-2</guid><pubDate>Mon, 05 Oct 2026 10:00:00 GMT</pubDate>',
    "<dc:creator>Ali</dc:creator><category>deals</category><category>news</category>",
    "<description><![CDATA[<p>Big <b>sale</b> today</p>]]></description>",
    "<content:encoded><![CDATA[<p>Full text</p>]]></content:encoded></item>",
    "<item><title>Older post</title><link>https://shop.example/b</link><pubDate>not a date</pubDate></item>",
    "</channel></rss>",
  ].join("\n");

  const atomXml = [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<feed xmlns="http://www.w3.org/2005/Atom"><title type="text">Blog</title>',
    '<link rel="self" href="https://blog.example/feed"/><link rel="alternate" href="https://blog.example/"/>',
    "<entry><title>Hello</title><id>tag:blog.example,2026:1</id>",
    '<link rel="alternate" type="text/html" href="https://blog.example/hello"/>',
    "<updated>2026-10-05T09:30:00Z</updated><author><name>Sara</name></author>",
    '<category term="intro"/><summary type="html">&lt;p&gt;Short&lt;/p&gt;</summary></entry>',
    "</feed>",
  ].join("\n");

  await test("RSS 2.0, Atom and RSS 1.0 feeds are read into the same shape", () => {
    const rss = parseFeed(rssXml);

    assert.equal(rss.title, "Shop News");
    assert.deepEqual(rss.items[0], {
      id: "post-2",
      title: "Tom & Jerry sale",
      link: "https://shop.example/a",
      pubDate: "2026-10-05T10:00:00.000Z",
      author: "Ali",
      snippet: "Big sale today",
      content: "<p>Full text</p>",
      categories: ["deals", "news"],
    });
    // No guid: the link identifies the item; an unreadable date is null
    assert.equal(rss.items[1].id, "https://shop.example/b");
    assert.equal(rss.items[1].pubDate, null);

    const atom = parseFeed(atomXml);

    assert.equal(atom.title, "Blog");
    assert.equal(atom.link, "https://blog.example/");
    assert.deepEqual(atom.items, [
      {
        id: "tag:blog.example,2026:1",
        title: "Hello",
        link: "https://blog.example/hello",
        pubDate: "2026-10-05T09:30:00.000Z",
        author: "Sara",
        snippet: "Short",
        content: "<p>Short</p>",
        categories: ["intro"],
      },
    ]);

    const rdf = parseFeed(
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"><channel><title>Old</title></channel>' +
        "<item><title>One</title><link>https://old.example/1</link></item></rdf:RDF>"
    );
    assert.equal(rdf.items.length, 1);
    assert.equal(rdf.items[0].link, "https://old.example/1");

    // A single item is still a list, and an empty feed has none
    assert.equal(parseFeed("<rss><channel><title>t</title></channel></rss>").items.length, 0);
    assert.throws(() => parseFeed("<html><body>Not a feed</body></html>"), /did not return an RSS or Atom feed/);
  });

  process.env.ALLOW_PRIVATE_NETWORK_REQUESTS = "true";

  const feedServer = createServer((request, response) => {
    if (request.url === "/missing") {
      response.writeHead(404).end("nope");
      return;
    }
    response.writeHead(200, { "Content-Type": "application/rss+xml" });
    response.end(rssXml);
  });
  await new Promise<void>((resolve) => feedServer.listen(0, "127.0.0.1", resolve));
  const feedUrl = "http://127.0.0.1:" + (feedServer.address() as AddressInfo).port;

  await test("RSS Read fetches a feed and the next node runs once per item", async () => {
    const titles: string[] = [];

    const context: Ctx = await runWorkflowGraph({
      graph: buildGraph(
        [
          { id: "read", type: "RSS_READ", data: { variableName: "feed", url: feedUrl + "/feed.xml", limit: "5" } },
          { id: "post", type: "SLACK" },
        ],
        [edge("read", "post")]
      ),
      context: {},
      runNode: (node, nodeContext, meta) =>
        runNodeForItems({
          node,
          context: nodeContext,
          items: meta.items,
          getActiveOutputs,
          execute: async (runContext, runItemsList) => {
            if (node.type === "RSS_READ") {
              return rssReadExecutor({ ...baseParams, data: node.data as any, context: runContext, items: runItemsList });
            }
            titles.push(renderTemplate("{{ $json.title }} -> {{item.link}}", runContext));
            return runContext;
          },
        }),
    });

    assert.equal(context.feed.title, "Shop News");
    assert.equal(context.feed.count, 2);
    assert.deepEqual(titles, [
      "Tom & Jerry sale -> https://shop.example/a",
      "Older post -> https://shop.example/b",
    ]);

    await assert.rejects(
      rssReadExecutor({ ...baseParams, context: {}, data: { variableName: "feed", url: feedUrl + "/missing" } }),
      /RSS Read node failed: The feed answered with status 404/
    );
    await assert.rejects(
      rssReadExecutor({ ...baseParams, context: {}, data: { variableName: "feed", url: "ftp://x" } }),
      /must start with http/
    );
  });

  delete process.env.ALLOW_PRIVATE_NETWORK_REQUESTS;
  feedServer.close();

  // ---------------------------------------------------------------- FILES
  console.log("Files");

  const fileFormats = await import("@/features/executions/lib/file-formats");
  const { resolveFileId, parseDriveId } = await import(
    "@/features/executions/components/files/executors"
  );
  const { sanitizeFileName } = await import("@/lib/workflow-files");

  await test("CSV is written and read back, including awkward cells", () => {
    const table = [
      { name: "Ali", note: 'said "hi", then left', total: 5 },
      { name: "Sara", note: "line one\nline two", extra: { a: 1 } },
    ];

    const csv = fileFormats.toCsv(table);

    assert.equal(
      csv,
      'name,note,total,extra\r\nAli,"said ""hi"", then left",5,\r\nSara,"line one\nline two",,"{""a"":1}"'
    );
    assert.deepEqual(fileFormats.parseCsv(csv), [
      { name: "Ali", note: 'said "hi", then left', total: "5", extra: "" },
      { name: "Sara", note: "line one\nline two", total: "", extra: '{"a":1}' },
    ]);

    // Excel's byte order mark, a semicolon file, blank lines and no header
    assert.deepEqual(fileFormats.parseCsv("﻿a;b\r\n\r\n1;2\r\n", { delimiter: ";" }), [{ a: "1", b: "2" }]);
    assert.deepEqual(fileFormats.parseCsv("1,2\n3,4", { header: false }), [
      { column1: "1", column2: "2" },
      { column1: "3", column2: "4" },
    ]);
    assert.equal(fileFormats.toCsv(["x", "y"]), "value\r\nx\r\ny");
    assert.deepEqual(fileFormats.parseCsv(""), []);
  });

  await test("a PDF is generated and paginated, in Latin, Urdu, Cyrillic and Greek", async () => {
    const { PDFDocument } = await import("pdf-lib");

    const pdf = await import("@/features/executions/lib/pdf");

    const small = await pdf.generatePdf({
      title: "Invoice 42",
      content: "## Customer\nAli Khan\n\n- 2 x Tea: 400\n- 1 x Cake: 900\n\n---\nTotal: 1300 – thanks!",
    });

    assert.equal(Buffer.from(small.bytes.slice(0, 5)).toString(), "%PDF-");
    assert.equal(small.pages, 1);

    const loaded = await PDFDocument.load(small.bytes);
    assert.equal(loaded.getTitle(), "Invoice 42");
    assert.deepEqual(loaded.getPage(0).getSize(), { width: 595.28, height: 841.89 });

    const long = await pdf.generatePdf({
      content: Array.from({ length: 400 }, (_, index) => "Paragraph " + index + " with a few more words in it.").join("\n\n"),
      pageSize: "Letter",
    });
    assert.ok(long.pages > 5, String(long.pages));

    // A word wider than the page is cut instead of running off it
    await pdf.generatePdf({ content: "x".repeat(2000) });

    // Urdu and Arabic switch to embedded fonts and right-to-left layout
    const urduWords = String.fromCodePoint(0x631, 0x633, 0x6cc, 0x62f, 0x20, 0x646, 0x645, 0x628, 0x631);
    const russian = String.fromCodePoint(0x41f, 0x440, 0x438, 0x432, 0x435, 0x442);
    const greek = String.fromCodePoint(0x395, 0x3bb, 0x3bb, 0x3b7, 0x3bd, 0x3b9, 0x3ba, 0x3ac);

    const urdu = await pdf.generatePdf({
      title: urduWords + " 42",
      content: "- " + urduWords + " (order) 1300\n\n" + russian + " and " + greek,
    });
    assert.equal(urdu.pages, 1);
    assert.equal(Buffer.from(urdu.bytes.slice(0, 5)).toString(), "%PDF-");
    assert.ok(urdu.bytes.length > small.bytes.length);

    // Scripts without a font are refused instead of drawn as boxes
    await assert.rejects(
      pdf.generatePdf({ content: "Chinese: " + String.fromCodePoint(0x4e2d, 0x6587) }),
      /cannot draw/
    );
  });

  await test("file fields accept a file, a node's result, an id or the current item", () => {
    const file = { id: "file_1", fileName: "a.pdf", mimeType: "application/pdf", size: 3, url: "u" };
    const fileContext = {
      pdf: { file, pages: 1 },
      api: { httpResponse: { status: 200, file: { ...file, id: "file_2" } } },
      idOnly: "file_3",
    };

    assert.equal(resolveFileId("X", fileContext, "pdf.file"), "file_1");
    assert.equal(resolveFileId("X", fileContext, "pdf"), "file_1");
    assert.equal(resolveFileId("X", fileContext, "{{pdf.file}}"), "file_1");
    assert.equal(resolveFileId("X", fileContext, "api"), "file_2");
    assert.equal(resolveFileId("X", fileContext, "{{idOnly}}"), "file_3");
    assert.equal(resolveFileId("X", { item: file, itemIndex: 0 }, ""), "file_1");
    assert.equal(resolveFileId("X", {}, "", [{ file }]), "file_1");

    assert.throws(() => resolveFileId("X", fileContext, ""), /File is required/);
    assert.throws(() => resolveFileId("X", fileContext, "missing.file"), /is not a file/);
  });

  await test("names and Drive links are cleaned up", () => {
    assert.equal(sanitizeFileName("../../etc/pass wd?.txt"), ".._.._etc_pass wd.txt");
    assert.equal(sanitizeFileName("  "), "file");
    assert.equal(fileFormats.mimeTypeForName("orders.CSV"), "text/csv");
    assert.equal(fileFormats.extensionForMimeType("application/pdf; charset=binary"), "pdf");
    assert.equal(fileFormats.isTextMimeType("application/json"), true);
    assert.equal(fileFormats.isTextMimeType("application/pdf"), false);

    const id = "1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
    assert.equal(parseDriveId("https://drive.google.com/file/d/" + id + "/view?usp=sharing"), id);
    assert.equal(parseDriveId("https://drive.google.com/drive/folders/" + id), id);
    assert.equal(parseDriveId("https://drive.google.com/open?id=" + id), id);
    assert.equal(parseDriveId(" " + id + " "), id);
  });

  await test("Convert to File ends a list and Extract from File starts one", async () => {
    const calls: string[] = [];

    await runWorkflowGraph({
      graph: buildGraph(
        [
          { id: "extract", type: "EXTRACT_FROM_FILE", data: { variableName: "rows" } },
          { id: "each", type: "SLACK" },
          { id: "convert", type: "CONVERT_TO_FILE", data: { variableName: "out" } },
          { id: "after", type: "EMAIL_SEND" },
        ],
        [edge("extract", "each"), edge("each", "convert"), edge("convert", "after")]
      ),
      context: {},
      runNode: (node, nodeContext, meta) =>
        runNodeForItems({
          node,
          context: nodeContext,
          items: meta.items,
          getActiveOutputs,
          execute: async (runContext, runItemsList) => {
            calls.push(node.id + (runItemsList ? ":" + runItemsList.length : ""));

            return node.id === "extract"
              ? { ...runContext, rows: { items: [{ a: 1 }, { a: 2 }], count: 2 } }
              : runContext;
          },
        }),
    });

    // Two rows: "each" runs twice, the file is written once from both
    // items, and the node after it runs once
    assert.deepEqual(calls, ["extract", "each", "each", "convert:2", "after"]);
  });

  await test("Excel, PDF and Word files are read", async () => {
    const readers = await import("@/features/executions/lib/file-readers");
    const pdf = await import("@/features/executions/lib/pdf");

    // Excel: written and read back, with typed cells and a second header
    const workbook = await readers.writeXlsx(
      [
        { name: "Ali", total: 5, paid: true, tags: ["a", "b"] },
        { name: "Sara", total: 7.5, note: "late" },
      ],
      "Orders/2026"
    );

    const sheet = await readers.readXlsx(workbook);
    assert.equal(sheet.sheet, "Orders 2026");
    assert.deepEqual(sheet.items, [
      { name: "Ali", total: 5, paid: true, tags: '["a","b"]', note: "" },
      { name: "Sara", total: 7.5, paid: "", tags: "", note: "late" },
    ]);
    assert.deepEqual((await readers.readXlsx(workbook, { header: false })).items[0], {
      column1: "name",
      column2: "total",
      column3: "paid",
      column4: "tags",
      column5: "note",
    });
    await assert.rejects(readers.readXlsx(workbook, { sheet: "Nope" }), /no sheet named "Nope"/);
    await assert.rejects(readers.readXlsx(Buffer.from("not a workbook")));

    // PDF: the text of a generated document comes back out
    const document = await pdf.generatePdf({
      title: "Invoice 42",
      content: "Customer: Ali Khan\n\n- 2 x Tea\n\nTotal: 1300",
    });
    const extracted = await readers.extractPdfText(document.bytes);

    assert.equal(extracted.pages, 1);
    assert.match(extracted.text, /Invoice 42/);
    assert.match(extracted.text, /Customer: Ali Khan/);
    assert.match(extracted.text, /Total: 1300/);

    // Word: a minimal .docx built by hand
    const JSZip = (await import("jszip")).default;
    const zip = new JSZip();
    zip.file(
      "[Content_Types].xml",
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'
    );
    zip.file(
      "_rels/.rels",
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'
    );
    zip.file(
      "word/document.xml",
      '<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
        "<w:p><w:r><w:t>Dear customer,</w:t></w:r></w:p><w:p><w:r><w:t>your order shipped.</w:t></w:r></w:p></w:body></w:document>"
    );

    const word = await readers.extractDocxText(await zip.generateAsync({ type: "nodebuffer" }));
    assert.match(word.text, /Dear customer,\s+your order shipped\./);
  });

  await test("an Attachments field lists several files", async () => {
    const { resolveFileIds } = await import(
      "@/features/executions/components/files/executors"
    );

    const file = (id: string) => ({ id, fileName: id + ".pdf", mimeType: "application/pdf", size: 1, url: "u" });
    const attachmentContext = { pdf: { file: file("f1") }, report: { file: file("f2") } };

    assert.deepEqual(resolveFileIds("X", attachmentContext, " pdf.file , report ,"), ["f1", "f2"]);
    assert.deepEqual(resolveFileIds("X", attachmentContext, ""), []);
    assert.deepEqual(resolveFileIds("X", attachmentContext, undefined), []);
    assert.throws(() => resolveFileIds("X", attachmentContext, "pdf.file, nope.file"), /is not a file/);
  });

  // ----------------------------------------------------------- SALESFORCE
  console.log("Salesforce");

  await test("the sign-in link uses PKCE and the right login host", async () => {
    process.env.SALESFORCE_CLIENT_ID = "client-id";
    process.env.SALESFORCE_CLIENT_SECRET = "client-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com/";

    const { createHash } = await import("node:crypto");
    const { createSalesforceAuthorization } = await import("@/lib/salesforce-oauth");

    const production = createSalesforceAuthorization("production", "state-1");
    const url = new URL(production.url);

    assert.equal(url.origin, "https://login.salesforce.com");
    assert.equal(url.searchParams.get("client_id"), "client-id");
    assert.equal(url.searchParams.get("state"), "state-1");
    assert.equal(
      url.searchParams.get("redirect_uri"),
      "https://app.example.com/api/oauth/salesforce/callback"
    );
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    // The challenge is the hash of the verifier kept in the cookie
    assert.equal(
      url.searchParams.get("code_challenge"),
      createHash("sha256").update(production.codeVerifier).digest("base64url")
    );
    // The secret never goes into the link
    assert.equal(production.url.includes("client-secret"), false);

    assert.equal(
      new URL(createSalesforceAuthorization("sandbox", "s").url).origin,
      "https://test.salesforce.com"
    );
    assert.notEqual(
      createSalesforceAuthorization("production", "s").codeVerifier,
      production.codeVerifier
    );
  });

  await test("the Salesforce node checks object names, record ids and fields first", async () => {
    const { salesforceExecutor } = await import(
      "@/features/executions/components/apps/salesforce"
    );
    const run = (data: Record<string, string>) =>
      salesforceExecutor({
        ...baseParams,
        context: { lead: { id: "00Q5g00000ABCdeEAH" } },
        data: { variableName: "sf", credentialId: "cred", ...data },
      });

    await assert.rejects(run({ operation: "query", query: " " }), /Query is required/);
    await assert.rejects(
      run({ operation: "get_record", object: "Lead/../x", recordId: "00Q5g00000ABCdeEAH" }),
      /Object must be an API name/
    );
    await assert.rejects(
      run({ operation: "get_record", object: "Lead", recordId: "123?x=1" }),
      /Record ID must be a 15 or 18 character/
    );
    await assert.rejects(
      run({ operation: "create_record", object: "Invoice__c", fieldsJson: "{}" }),
      /at least one field/
    );
    await assert.rejects(
      run({ operation: "update_record", object: "Lead", recordId: "{{lead.id}}", fieldsJson: "[1]" }),
      /must be a JSON object/
    );
    await assert.rejects(run({ operation: "merge" }), /Unsupported operation/);
  });

  // ------------------------------------------------------------------ SSH
  console.log("SSH");

  const ssh = await import("@/lib/ssh");
  const { getRequiredPlanForNode } = await import("@/config/plans");

  await test("SSH is Pro-only and the free trial does not unlock it", () => {
    const trial = new Date(Date.now() + 86_400_000);

    assert.equal(getRequiredPlanForNode("SSH", "FREE", trial), "Pro");
    assert.equal(getRequiredPlanForNode("SSH", "INTERMEDIATE", trial), "Pro");
    assert.equal(getRequiredPlanForNode("SSH", "PRO", null), null);
    // Other locked nodes are still opened by the trial
    assert.equal(getRequiredPlanForNode("AI_AGENT", "FREE", trial), null);
    assert.equal(getRequiredPlanForNode("AI_AGENT", "FREE", null), "Intermediate");
  });

  await test("values are quoted for the shell, also from a template", () => {
    assert.equal(ssh.shellQuote("plain"), "'plain'");
    assert.equal(ssh.shellQuote("a b; rm -rf /"), "'a b; rm -rf /'");
    assert.equal(ssh.shellQuote("it's"), "'it'\\''s'");
    assert.equal(
      renderTemplate("echo {{shellQuote name}}", { name: "x'; reboot; echo '" }),
      "echo 'x'\\''; reboot; echo '\\'''"
    );
  });

  await test("servers on a private network are refused", async () => {
    for (const host of ["127.0.0.1", "localhost", "10.0.0.8", "192.168.1.10", "169.254.169.254"]) {
      await assert.rejects(
        ssh.runSshCommand({ host, username: "u", password: "p" }, "id"),
        /not allowed/,
        host
      );
    }
    await assert.rejects(
      ssh.runSshCommand({ host: "bad host", username: "u", password: "p" }, "id"),
      /not a valid host name/
    );
    await assert.rejects(
      ssh.runSshCommand({ host: "8.8.8.8", username: "u", authType: "privateKey" }, "id"),
      /no private key/
    );
  });

  // A real SSH server on this machine, to run commands against
  process.env.ALLOW_PRIVATE_NETWORK_REQUESTS = "true";

  // ssh2 is CommonJS: its exports arrive on "default" when imported this way
  const ssh2Module = await import("ssh2");
  const { Server, utils: sshUtils } = (ssh2Module.default ?? ssh2Module) as typeof ssh2Module;
  const { createHash: sshHash } = await import("node:crypto");
  const hostKey = sshUtils.generateKeyPairSync("ed25519");
  const userKey = sshUtils.generateKeyPairSync("ed25519");
  const userPublicKey = sshUtils.parseKey(userKey.public);
  if (userPublicKey instanceof Error) throw userPublicKey;
  const hostPublicKey = sshUtils.parseKey(hostKey.public);
  if (hostPublicKey instanceof Error) throw hostPublicKey;

  const hostFingerprint =
    "SHA256:" + sshHash("sha256").update(hostPublicKey.getPublicSSH()).digest("base64").replace(/=+$/, "");

  const executed: string[] = [];

  const sshServer = new Server({ hostKeys: [hostKey.private] }, (client) => {
    client
      .on("authentication", (auth) => {
        if (auth.method === "password" && auth.username === "deploy" && auth.password === "secret") {
          return auth.accept();
        }
        if (
          auth.method === "publickey" &&
          auth.username === "deploy" &&
          auth.key.algo === userPublicKey.type &&
          auth.key.data.equals(userPublicKey.getPublicSSH()) &&
          (!auth.signature || userPublicKey.verify(auth.blob!, auth.signature, auth.hashAlgo) === true)
        ) {
          return auth.accept();
        }
        auth.reject(["password", "publickey"]);
      })
      .on("ready", () => {
        client.on("session", (accept) => {
          accept().on("exec", (acceptExec, _reject, info) => {
            const stream = acceptExec();
            executed.push(info.command);

            if (info.command === "hang") return; // never answers
            if (info.command === "big") {
              stream.write("x".repeat(700 * 1024));
              stream.exit(0);
              stream.end();
              return;
            }
            if (info.command.startsWith("fail")) {
              stream.stderr.write("boom\n");
              stream.exit(3);
              stream.end();
              return;
            }

            stream.write("ran: " + info.command + "\n");
            stream.exit(0);
            stream.end();
          });
        });
      })
      .on("error", () => {});
  });

  await new Promise<void>((resolve) => sshServer.listen(0, "127.0.0.1", resolve));
  const sshPort = (sshServer.address() as AddressInfo).port;
  const login = { host: "127.0.0.1", port: sshPort, username: "deploy" };

  await test("a command runs with a password or a private key and reports its exit code", async () => {
    assert.deepEqual(await ssh.runSshCommand({ ...login, password: "secret" }, "uptime"), {
      stdout: "ran: uptime\n",
      stderr: "",
      code: 0,
      signal: null,
      truncated: false,
    });

    const withKey = await ssh.runSshCommand(
      { ...login, authType: "privateKey", privateKey: userKey.private },
      "cd -- " + ssh.shellQuote("/var/www/my app") + " && ls"
    );
    assert.equal(withKey.stdout, "ran: cd -- '/var/www/my app' && ls\n");

    // A failing command is a result, not an exception (like n8n)
    const failed = await ssh.runSshCommand({ ...login, password: "secret" }, "fail now");
    assert.equal(failed.code, 3);
    assert.equal(failed.stderr, "boom\n");
  });

  await test("bad logins, a changed host key, long output and hung commands are handled", async () => {
    await assert.rejects(
      ssh.runSshCommand({ ...login, password: "wrong" }, "id"),
      /rejected the username, password or key/
    );
    await assert.rejects(
      ssh.runSshCommand({ ...login, authType: "privateKey", privateKey: "not a key" }, "id"),
      /private key could not be read/
    );

    // The pinned fingerprint: the right one connects, another is refused
    const pinned = await ssh.runSshCommand({ ...login, password: "secret", hostFingerprint }, "id");
    assert.equal(pinned.code, 0);
    await assert.rejects(
      ssh.runSshCommand(
        { ...login, password: "secret", hostFingerprint: "SHA256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" },
        "id"
      ),
      /host key does not match/
    );

    const big = await ssh.runSshCommand({ ...login, password: "secret" }, "big");
    assert.equal(big.truncated, true);
    assert.equal(big.stdout.length, 512 * 1024);

    const started = Date.now();
    await assert.rejects(
      ssh.runSshCommand({ ...login, password: "secret" }, "hang", { timeoutSeconds: 1 }),
      /did not finish within 1 seconds/
    );
    assert.ok(Date.now() - started < 5000);
  });

  delete process.env.ALLOW_PRIVATE_NETWORK_REQUESTS;
  sshServer.close();

  // ------------------------------------------------------------ TEMPLATES
  console.log("Templates");

  const templateData = await import("@/features/templates/lib/template-data");

  await test("saving a template removes credentials, secrets and the start node", () => {
    const saved = templateData.toTemplateData(
      [
        { id: "start", type: "INITIAL", position: { x: 0, y: 0 }, data: {} },
        { id: "hook", type: "WEBHOOK_TRIGGER", position: { x: 1, y: 1 }, data: { secret: "s3cret", responseMode: "lastNode" } },
        {
          id: "agent",
          type: "AI_AGENT",
          position: { x: 2, y: 2 },
          data: { systemMessage: "Be kind", toolSettings: { slack: { name: "notify" } } },
        },
        { id: "model", type: "OPENAI", position: { x: 2, y: 3 }, data: { credentialId: "cred_1", model: "gpt-4o-mini" } },
        { id: "slack", type: "SLACK", position: { x: 3, y: 3 }, data: { webhookUrl: "https://hooks.slack.com/x", content: "Hi" } },
        { id: "wa", type: "WHATSAPP_TRIGGER", position: { x: 4, y: 4 }, data: { verifyToken: "v", appSecret: "a" } },
        { id: "sub", type: "EXECUTE_WORKFLOW", position: { x: 5, y: 5 }, data: { workflowId: "wf_mine", inputMode: "all" } },
      ],
      [
        { fromNodeId: "hook", toNodeId: "agent", fromOutput: "source-1", toInput: "flow-in" },
        { fromNodeId: "model", toNodeId: "agent", fromOutput: "source-1", toInput: "sub-model" },
        { fromNodeId: "slack", toNodeId: "agent", fromOutput: "source-1", toInput: "sub-tools" },
        { fromNodeId: "start", toNodeId: "hook", fromOutput: "source-1", toInput: "target-1" },
      ]
    );

    const json = JSON.stringify(saved);
    for (const secret of ["s3cret", "cred_1", "hooks.slack.com", '"verifyToken"', '"appSecret"', "wf_mine"]) {
      assert.equal(json.includes(secret), false, secret);
    }

    // Settings that are not secrets stay
    assert.equal(saved.nodes.find((node) => node.id === "hook")!.data.responseMode, "lastNode");
    assert.equal(saved.nodes.find((node) => node.id === "model")!.data.model, "gpt-4o-mini");
    assert.equal(saved.nodes.find((node) => node.id === "slack")!.data.content, "Hi");

    assert.equal(saved.nodes.some((node) => node.type === "INITIAL"), false);
    assert.equal(saved.connections.length, 3);
    assert.deepEqual(saved.nodeTypes, [
      "WEBHOOK_TRIGGER",
      "AI_AGENT",
      "OPENAI",
      "SLACK",
      "WHATSAPP_TRIGGER",
      "EXECUTE_WORKFLOW",
    ]);
  });

  await test("using a template gives fresh node ids and keeps everything wired", () => {
    let counter = 0;
    const copy = templateData.instantiateTemplate(
      [
        { id: "agent", type: "AI_AGENT", position: {}, data: { toolSettings: { tool: { name: "notify" }, gone: { name: "x" } } } },
        { id: "tool", type: "SLACK", position: {}, data: { content: "Hi" } },
      ],
      [
        { fromNodeId: "tool", toNodeId: "agent", fromOutput: "source-1", toInput: "sub-tools" },
        { fromNodeId: "tool", toNodeId: "missing", fromOutput: "source-1", toInput: "target-1" },
      ],
      () => "new_" + ++counter
    );

    assert.deepEqual(copy.nodes.map((node) => node.id), ["new_1", "new_2"]);
    // The agent's tool settings follow the tool's new id
    assert.deepEqual(copy.nodes[0].data.toolSettings, { new_2: { name: "notify" } });
    assert.deepEqual(copy.connections, [
      { fromNodeId: "new_2", toNodeId: "new_1", fromOutput: "source-1", toInput: "sub-tools" },
    ]);

    // Two users of the same template never share ids
    const second = templateData.instantiateTemplate(
      [{ id: "agent", type: "AI_AGENT", position: {}, data: {} }],
      [],
      () => "new_" + ++counter
    );
    assert.equal(second.nodes[0].id, "new_3");
  });

  await test("plan locks and the admin list", () => {
    const trial = new Date(Date.now() + 86_400_000);
    const expired = new Date(Date.now() - 86_400_000);

    assert.equal(templateData.canUseTemplate("FREE", "FREE", null), true);
    assert.equal(templateData.canUseTemplate("PRO", "INTERMEDIATE", null), false);
    assert.equal(templateData.canUseTemplate("INTERMEDIATE", "PRO", null), true);
    assert.equal(templateData.canUseTemplate("PRO", "FREE", trial), true);
    assert.equal(templateData.canUseTemplate("PRO", "FREE", expired), false);

    process.env.ADMIN_EMAILS = " Owner@Example.com , second@example.com ";
    assert.equal(templateData.isAdminEmail("owner@example.com"), true);
    assert.equal(templateData.isAdminEmail("SECOND@example.com "), true);
    assert.equal(templateData.isAdminEmail("someone@example.com"), false);
    assert.equal(templateData.isAdminEmail(""), false);

    // Nobody is an admin when the variable is not set
    delete process.env.ADMIN_EMAILS;
    assert.equal(templateData.isAdminEmail("owner@example.com"), false);
  });

  console.log(`\n${passed} checks passed`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
