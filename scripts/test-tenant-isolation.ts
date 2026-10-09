// Checks tenant isolation against a real database: user B tries to read,
// change and delete user A's workflow, execution, credential, file and API
// key through tRPC, through /api/v1 and through the loaders behind the file
// download and node log URLs. Every attempt must be "not found" (404), and
// user A's records must be untouched afterwards.
//
//   npx tsx --env-file=.env --conditions=react-server scripts/test-tenant-isolation.ts --confirm
//
// It needs the app's environment (DATABASE_URL, ENCRYPTION_KEY and the auth
// settings; --env-file reads them from .env) and a database with all
// migrations applied. It does not need the app
// or Inngest to be running. It creates two temporary users, whose emails
// end in @tenant-test.invalid, and deletes them and everything they own
// when it finishes, also when a check fails. Use a development database.

import { NextRequest } from "next/server";
import { TRPCError } from "@trpc/server";
import { getHTTPStatusCodeFromError } from "@trpc/server/http";
import { ExecutionStatus, NodeType, PrismaClient } from "@prisma/client";
import { createCallerFactory, type TRPCContext } from "../src/trpc/init";
import { appRouter } from "../src/trpc/routers/_app";
import { encrypt } from "../src/lib/encryption";
import { generateApiKey } from "../src/lib/api-keys";
import { API_SCOPES } from "../src/lib/api-key-scopes";
import { NotFoundError } from "../src/lib/ownership";
import { getOwnedWorkflowFile } from "../src/lib/workflow-files";
import { getOwnedExecutionNodes } from "../src/features/executions/server/nodes";
import { GET as v1ListWorkflows } from "../src/app/api/v1/workflows/route";
import { POST as v1ExecuteWorkflow } from "../src/app/api/v1/workflows/[workflowId]/execute/route";
import { GET as v1ListExecutions } from "../src/app/api/v1/executions/route";
import { GET as v1GetExecution } from "../src/app/api/v1/executions/[executionId]/route";
import { POST as v1RetryExecution } from "../src/app/api/v1/executions/[executionId]/retry/route";

const prisma = new PrismaClient();
const run = Math.random().toString(36).slice(2, 10);

let passed = 0;
const failures: string[] = [];

const check = async (name: string, fn: () => unknown) => {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`  FAIL  ${name}: ${error instanceof Error ? error.message : error}`);
  }
};

// The call must fail with tRPC's NOT_FOUND, which the HTTP handler sends as 404
const expectTrpc404 = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (error) {
    if (error instanceof TRPCError && getHTTPStatusCodeFromError(error) === 404) return;
    throw new Error(`expected 404, got ${error instanceof TRPCError ? error.code : error}`);
  }
  throw new Error("expected 404, but the call succeeded");
};

const expectNotFoundError = async (call: () => Promise<unknown>) => {
  try {
    await call();
  } catch (error) {
    if (error instanceof NotFoundError) return;
    throw new Error(`expected NotFoundError, got ${error}`);
  }
  throw new Error("expected NotFoundError, but the call succeeded");
};

const expectStatus = async (response: Response, status: number) => {
  if (response.status !== status) {
    throw new Error(`expected ${status}, got ${response.status}: ${await response.text()}`);
  }
};

const createUser = (label: string) =>
  prisma.user.create({
    data: {
      id: `tenant-test-${label}-${run}`,
      name: `Tenant test ${label}`,
      email: `${label}-${run}@tenant-test.invalid`,
      emailVerified: true,
      // The free trial unlocks API access whatever the plan
      trialEndsAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

type TestUser = Awaited<ReturnType<typeof createUser>>;

// What protectedProcedure would have read from the user's session cookie
const callerFor = (user: TestUser) =>
  createCallerFactory(appRouter)({
    userId: user.id,
    session: {
      user,
      session: {
        id: `session-${user.id}`,
        userId: user.id,
        token: `token-${user.id}`,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    } as unknown as NonNullable<TRPCContext["session"]>,
  });

const createApiKey = async (user: TestUser) => {
  const { key, keyHash, prefix } = generateApiKey();

  const row = await prisma.apiKey.create({
    data: { name: "tenant test", keyHash, prefix, scopes: [...API_SCOPES], userId: user.id },
  });

  return { id: row.id, key };
};

const apiRequest = (path: string, key: string, method = "GET") =>
  new NextRequest(`http://localhost${path}`, {
    method,
    headers: { authorization: `Bearer ${key}` },
  });

const main = async () => {
  if (!process.argv.includes("--confirm")) {
    console.log(
      "This creates two temporary users in the database of DATABASE_URL and deletes them again.\n" +
        "Run it against a development database, with --confirm."
    );
    return;
  }

  const userA = await createUser("a");
  const userB = await createUser("b");
  const apiKeyIds: string[] = [];

  try {
    // ----------------------------------------------- what user A owns
    const workflow = await prisma.workflow.create({
      data: {
        name: "A's workflow",
        userId: userA.id,
        nodes: {
          create: {
            name: NodeType.MANUAL_TRIGGER,
            type: NodeType.MANUAL_TRIGGER,
            position: { x: 0, y: 0 },
          },
        },
      },
      include: { nodes: true },
    });

    const execution = await prisma.execution.create({
      data: {
        workflowId: workflow.id,
        status: ExecutionStatus.SUCCESS,
        completedAt: new Date(),
        trigger: NodeType.MANUAL_TRIGGER,
        inputData: { secret: "A's input" },
        output: { secret: "A's output" },
        nodes: {
          create: {
            nodeId: workflow.nodes[0].id,
            nodeName: "Trigger",
            nodeType: NodeType.MANUAL_TRIGGER,
            status: ExecutionStatus.SUCCESS,
            output: { secret: "A's node output" },
          },
        },
      },
    });

    const credential = await prisma.credential.create({
      data: {
        name: "A's credential",
        type: "OPENAI",
        value: encrypt("sk-user-a-secret-000000"),
        userId: userA.id,
      },
    });

    const file = await prisma.workflowFile.create({
      data: {
        userId: userA.id,
        fileName: "a.txt",
        mimeType: "text/plain",
        size: 1,
        data: Buffer.from("A"),
      },
    });

    const keyA = await createApiKey(userA);
    const keyB = await createApiKey(userB);
    apiKeyIds.push(keyA.id, keyB.id);

    // User B's own workflow: shows that B's calls work at all
    const workflowB = await prisma.workflow.create({
      data: { name: "B's workflow", userId: userB.id },
    });

    const asA = callerFor(userA);
    const asB = callerFor(userB);
    const node = {
      id: `tenant-test-node-${run}`,
      type: NodeType.MANUAL_TRIGGER,
      position: { x: 0, y: 0 },
    };

    // ----------------------------------------------- controls
    console.log("The owner can use their own records");

    await check("A reads their workflow, execution and credential", async () => {
      if ((await asA.workflows.getOne({ id: workflow.id })).id !== workflow.id) throw new Error("workflow");
      if ((await asA.executions.getOne({ id: execution.id })).id !== execution.id) throw new Error("execution");
      if ((await asA.credentials.getOne({ id: credential.id })).id !== credential.id) throw new Error("credential");
      if ((await getOwnedWorkflowFile(file.id, userA.id)).id !== file.id) throw new Error("file");
      if ((await getOwnedExecutionNodes(execution.id, userA.id)).length !== 1) throw new Error("node logs");
    });
    await check("B reads and renames their own workflow", async () => {
      await asB.workflows.getOne({ id: workflowB.id });
      await asB.workflows.updateName({ id: workflowB.id, name: "B's renamed workflow" });
    });
    await check("A's API key reads A's execution", async () =>
      expectStatus(
        await v1GetExecution(apiRequest(`/api/v1/executions/${execution.id}`, keyA.key), {
          params: Promise.resolve({ executionId: execution.id }),
        }),
        200
      )
    );

    // ----------------------------------------------- tRPC
    console.log("tRPC: user B on user A's records");

    await check("workflows.getOne", () => expectTrpc404(() => asB.workflows.getOne({ id: workflow.id })));
    await check("workflows.updateName", () =>
      expectTrpc404(() => asB.workflows.updateName({ id: workflow.id, name: "taken over" })));
    await check("workflows.update (save)", () =>
      expectTrpc404(() => asB.workflows.update({ id: workflow.id, nodes: [node], edges: [] })));
    await check("workflows.setActive", () =>
      expectTrpc404(() => asB.workflows.setActive({ id: workflow.id, active: true })));
    await check("workflows.setSaveExecutionData", () =>
      expectTrpc404(() => asB.workflows.setSaveExecutionData({ id: workflow.id, save: false })));
    await check("workflows.execute", () => expectTrpc404(() => asB.workflows.execute({ id: workflow.id })));
    await check("workflows.remove", () => expectTrpc404(() => asB.workflows.remove({ id: workflow.id })));

    await check("executions.getOne", () => expectTrpc404(() => asB.executions.getOne({ id: execution.id })));
    await check("executions.getLatestData", () =>
      expectTrpc404(() => asB.executions.getLatestData({ workflowId: workflow.id })));
    await check("executions.retry", () => expectTrpc404(() => asB.executions.retry({ id: execution.id })));

    await check("credentials.getOne", () => expectTrpc404(() => asB.credentials.getOne({ id: credential.id })));
    await check("credentials.update", () =>
      expectTrpc404(() =>
        asB.credentials.update({ id: credential.id, name: "taken over", type: "OPENAI", value: "sk-b" })));
    await check("credentials.remove", () => expectTrpc404(() => asB.credentials.remove({ id: credential.id })));

    await check("apiKeys.remove", () => expectTrpc404(() => asB.apiKeys.remove({ id: keyA.id })));

    await check("an id that does not exist gives the same answer", async () => {
      await expectTrpc404(() => asB.workflows.getOne({ id: "does-not-exist" }));
      await expectTrpc404(() => asB.executions.getOne({ id: "does-not-exist" }));
      await expectTrpc404(() => asB.credentials.getOne({ id: "does-not-exist" }));
      await expectTrpc404(() => asB.apiKeys.remove({ id: "does-not-exist" }));
    });

    await check("B's lists contain nothing of A's", async () => {
      const ids = [workflow.id, execution.id, credential.id, keyA.id];
      const lists = [
        (await asB.workflows.getMany({})).items,
        (await asB.executions.getMany({})).items,
        (await asB.credentials.getMany({})).items,
        await asB.credentials.getByType({ type: "OPENAI" }),
        (await asB.apiKeys.getMany()).items,
      ];

      for (const list of lists) {
        const leaked = (list as { id: string }[]).find((item) => ids.includes(item.id));
        if (leaked) throw new Error(`a list returned ${leaked.id}`);
      }
    });

    await check("B's workflow cannot be linked to A's credential or A's nodes", async () => {
      // Saving with A's credential id works, but the node is not linked to it
      await asB.workflows.update({
        id: workflowB.id,
        nodes: [{ ...node, credentialId: credential.id }],
        edges: [],
      });
      const saved = await prisma.node.findUniqueOrThrow({ where: { id: node.id } });
      if (saved.credentialId !== null) throw new Error("the node was linked to A's credential");

      // A connection to one of A's nodes, or a node id A already uses, is refused
      for (const attempt of [
        { nodes: [node], edges: [{ source: node.id, target: workflow.nodes[0].id }] },
        { nodes: [{ ...node, id: workflow.nodes[0].id }], edges: [] },
      ]) {
        try {
          await asB.workflows.update({ id: workflowB.id, ...attempt });
        } catch (error) {
          if (error instanceof TRPCError && error.code === "BAD_REQUEST") continue;
          throw error;
        }
        throw new Error("the save was accepted");
      }
    });

    // ----------------------------------------------- /api/v1
    console.log("/api/v1: user B's API key on user A's records");

    await check("GET /api/v1/executions/:id", async () =>
      expectStatus(
        await v1GetExecution(apiRequest(`/api/v1/executions/${execution.id}`, keyB.key), {
          params: Promise.resolve({ executionId: execution.id }),
        }),
        404
      ));
    await check("POST /api/v1/executions/:id/retry", async () =>
      expectStatus(
        await v1RetryExecution(apiRequest(`/api/v1/executions/${execution.id}/retry`, keyB.key, "POST"), {
          params: Promise.resolve({ executionId: execution.id }),
        }),
        404
      ));
    await check("POST /api/v1/workflows/:id/execute", async () =>
      expectStatus(
        await v1ExecuteWorkflow(apiRequest(`/api/v1/workflows/${workflow.id}/execute`, keyB.key, "POST"), {
          params: Promise.resolve({ workflowId: workflow.id }),
        }),
        404
      ));
    await check("GET /api/v1/executions?workflowId=", async () =>
      expectStatus(
        await v1ListExecutions(apiRequest(`/api/v1/executions?workflowId=${workflow.id}`, keyB.key)),
        404
      ));
    await check("GET /api/v1/workflows and /executions list nothing of A's", async () => {
      for (const response of [
        await v1ListWorkflows(apiRequest("/api/v1/workflows", keyB.key)),
        await v1ListExecutions(apiRequest("/api/v1/executions", keyB.key)),
      ]) {
        await expectStatus(response, 200);
        const body = JSON.stringify(await response.json());
        if (body.includes(workflow.id) || body.includes(execution.id)) {
          throw new Error("a list returned one of A's ids");
        }
      }
    });

    // ----------------------------------------------- download and log URLs
    console.log("File download and node log URLs: user B on user A's records");

    // GET /api/files/:id and GET /api/executions/:id/nodes read the session
    // from the request and then call these two loaders; a NotFoundError
    // from them is sent as 404
    await check("GET /api/files/:id (file download)", () =>
      expectNotFoundError(() => getOwnedWorkflowFile(file.id, userB.id)));
    await check("GET /api/executions/:id/nodes (node logs)", () =>
      expectNotFoundError(() => getOwnedExecutionNodes(execution.id, userB.id)));

    // ----------------------------------------------- nothing changed
    console.log("Afterwards");

    await check("A's records are untouched", async () => {
      const after = await prisma.workflow.findUnique({
        where: { id: workflow.id },
        include: { nodes: true },
      });
      if (!after) throw new Error("the workflow was deleted");
      if (after.name !== "A's workflow") throw new Error("the workflow was renamed");
      if (after.active) throw new Error("the workflow was activated");
      if (!after.saveExecutionData) throw new Error("the workflow's setting was changed");
      if (after.nodes.length !== 1 || after.nodes[0].id !== workflow.nodes[0].id) {
        throw new Error("the workflow's nodes were replaced");
      }

      const credentialAfter = await prisma.credential.findUnique({ where: { id: credential.id } });
      if (!credentialAfter) throw new Error("the credential was deleted");
      if (credentialAfter.name !== "A's credential" || credentialAfter.value !== credential.value) {
        throw new Error("the credential was changed");
      }

      if (!(await prisma.apiKey.findUnique({ where: { id: keyA.id } }))) throw new Error("the API key was deleted");
      if (!(await prisma.workflowFile.findUnique({ where: { id: file.id } }))) throw new Error("the file was deleted");
      if ((await prisma.execution.count({ where: { workflowId: workflow.id } })) !== 1) {
        throw new Error("an execution was started or deleted");
      }
    });
  } finally {
    // Workflows, executions, credentials, files and API keys go with the users
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id] } } });
    await prisma.rateLimit.deleteMany({
      where: { key: { in: apiKeyIds.map((id) => `api:${id}`) } },
    });
  }

  console.log(`\n${passed} checks passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
};

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
