import "server-only";

import { NodeType, type Prisma } from "@prisma/client";
import { PLAN_LIMITS } from "@/config/plans";
import { removeStalePins } from "@/features/executions/server/test-data";
import { saveWorkflowVersion } from "@/features/workflows/server/versions";
import prisma from "@/lib/db";
import { readCredentialValue } from "@/lib/external-secrets";
import { redactString } from "@/lib/redaction";
import {
  GIT_MAX_FILE_BYTES,
  GIT_MAX_WORKFLOWS,
  findFileSecrets,
  fromWorkflowFile,
  parseWorkflowFile,
  serializeWorkflowFile,
  toWorkflowFile,
  workflowFilePath,
  type WorkflowFile,
} from "../lib/workflow-files";

// Git sync: a workspace's workflows as JSON files in a GitHub repository.
// "Push" writes them as one commit; "pull" makes the workspace's workflows
// what the files say. Only ever GitHub's own API address is called.

const GITHUB_API = "https://api.github.com";
const REQUEST_TIMEOUT_MS = 20_000;
const READ_BATCH = 8;

export class GitSyncError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GitSyncError";
  }
}

type GitTarget = { repo: string; branch: string; folder: string; token: string };

const github = async <T>(
  target: GitTarget,
  method: string,
  path: string,
  body?: unknown,
  // What a 404 means here, in words
  notFound?: string
): Promise<T> => {
  let response: Response;

  try {
    response = await fetch(`${GITHUB_API}/repos/${target.repo}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${target.token}`,
        accept: "application/vnd.github+json",
        "x-github-api-version": "2022-11-28",
        "user-agent": "RXJ",
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new GitSyncError(
      `GitHub could not be reached: ${redactString(String((error as Error)?.message ?? error), { secrets: [target.token] }).slice(0, 200)}`
    );
  }

  if (response.ok) return (await response.json()) as T;

  if (response.status === 404 && notFound) throw new GitSyncError(notFound);

  if (response.status === 401) {
    throw new GitSyncError("GitHub refused the token of the Git sync credential. It may have expired.");
  }

  if (response.status === 403 || response.status === 404) {
    throw new GitSyncError(
      `GitHub refused (${response.status}): the token needs access to ${target.repo}, with "Contents: read and write" to push.`
    );
  }

  // GitHub's own words, which never repeat the token; cleaned all the same
  const message = ((await response.json().catch(() => ({}))) as { message?: string }).message ?? "";

  throw new GitSyncError(
    `GitHub answered ${response.status}${message ? `: ${redactString(message, { secrets: [target.token] }).slice(0, 200)}` : ""}`
  );
};

const encodeRef = (branch: string) => branch.split("/").map(encodeURIComponent).join("/");

/**
 * The branch as it is now: its newest commit, that commit's tree, and the
 * workflow files in the folder.
 */
const readBranch = async (target: GitTarget) => {
  const ref = await github<{ object: { sha: string } }>(
    target,
    "GET",
    `/git/ref/heads/${encodeRef(target.branch)}`,
    undefined,
    `The branch "${target.branch}" was not found in ${target.repo} (or the token cannot see the repository). Create the branch on GitHub first.`
  );
  const commit = await github<{ tree: { sha: string } }>(target, "GET", `/git/commits/${ref.object.sha}`);
  const tree = await github<{ tree: { path: string; type: string; sha: string; size?: number }[]; truncated?: boolean }>(
    target,
    "GET",
    `/git/trees/${commit.tree.sha}?recursive=1`
  );

  if (tree.truncated) {
    throw new GitSyncError("The repository is too large to read in one go. Use a repository of its own for the workflows.");
  }

  const prefix = `${target.folder}/`;

  return {
    commitSha: ref.object.sha,
    treeSha: commit.tree.sha,
    // Directly in the folder: <id>.json
    files: tree.tree.filter(
      (entry) =>
        entry.type === "blob" &&
        entry.path.startsWith(prefix) &&
        entry.path.endsWith(".json") &&
        !entry.path.slice(prefix.length).includes("/")
    ),
  };
};

/**
 * The settings of a workspace's Git sync with the token of its credential.
 */
export const loadGitTarget = async (workspaceId: string, ownerId: string): Promise<GitTarget> => {
  const settings = await prisma.workspaceGit.findUnique({ where: { workspaceId } });

  if (!settings) throw new GitSyncError("Git sync is not set up for this workspace.");

  // A credential of this workspace, whatever id the settings hold
  const credential = await prisma.credential.findFirst({
    where: { id: settings.credentialId, userId: ownerId, type: "GITHUB" },
    select: { value: true },
  });

  if (!credential) {
    throw new GitSyncError("The GitHub credential of Git sync was deleted. Pick another one in its settings.");
  }

  const token = (await readCredentialValue(credential.value, ownerId)).trim();

  if (!token) throw new GitSyncError("The GitHub credential of Git sync is empty.");

  return { repo: settings.repo, branch: settings.branch, folder: settings.folder, token };
};

const loadWorkspaceFiles = async (ownerId: string) => {
  const [workflows, credentials] = await Promise.all([
    prisma.workflow.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: "asc" },
      take: GIT_MAX_WORKFLOWS + 1,
      select: {
        id: true,
        name: true,
        gitSourceId: true,
        nodes: { select: { id: true, type: true, position: true, data: true, credentialId: true } },
        connections: { select: { fromNodeId: true, toNodeId: true, fromOutput: true, toInput: true } },
      },
    }),
    prisma.credential.findMany({
      where: { userId: ownerId },
      select: { id: true, name: true, type: true },
    }),
  ]);

  if (workflows.length > GIT_MAX_WORKFLOWS) {
    throw new GitSyncError(`Git sync handles up to ${GIT_MAX_WORKFLOWS} workflows in a workspace.`);
  }

  const byId = new Map(credentials.map((credential) => [credential.id, credential]));

  return workflows.map((workflow) => ({
    workflowId: workflow.id,
    file: toWorkflowFile({
      // The id it has in the repository, when it came from there
      id: workflow.gitSourceId ?? workflow.id,
      name: workflow.name,
      // The placeholder of an empty canvas is not part of a workflow
      nodes: workflow.nodes.filter((node) => node.type !== NodeType.INITIAL),
      connections: workflow.connections,
      credentials: byId,
    }),
  }));
};

/**
 * Writes the workspace's workflows to the branch as one commit: a file per
 * workflow, and the files of workflows that are gone removed. Nothing is
 * committed when the branch already holds exactly this.
 */
export const pushWorkflows = async ({
  workspaceId,
  ownerId,
  message,
}: {
  workspaceId: string;
  ownerId: string;
  message: string;
}) => {
  const target = await loadGitTarget(workspaceId, ownerId);
  const files = await loadWorkspaceFiles(ownerId);

  // A repository is read by more people than a workspace: a workflow with
  // a secret typed into a node is not written to one
  const withSecrets = files.flatMap(({ file }) => {
    const kinds = findFileSecrets(file);

    return kinds.length > 0 ? [`"${file.name}" (${kinds.join(", ")})`] : [];
  });

  if (withSecrets.length > 0) {
    throw new GitSyncError(
      `Not pushed: ${withSecrets.length === 1 ? "a workflow has" : "workflows have"} a secret typed into a node: ${withSecrets.slice(0, 5).join("; ")}. Move it to a credential first.`
    );
  }

  const branch = await readBranch(target);

  const wanted = new Map(
    files.map(({ file }) => [workflowFilePath(target.folder, file.id), serializeWorkflowFile(file)])
  );

  for (const [path, content] of wanted) {
    if (Buffer.byteLength(content, "utf8") > GIT_MAX_FILE_BYTES) {
      throw new GitSyncError(`Not pushed: ${path} would be larger than 1 MB.`);
    }
  }

  const removed = branch.files.filter((entry) => !wanted.has(entry.path));

  const tree = await github<{ sha: string }>(target, "POST", "/git/trees", {
    base_tree: branch.treeSha,
    tree: [
      ...[...wanted].map(([path, content]) => ({ path, mode: "100644", type: "blob", content })),
      ...removed.map((entry) => ({ path: entry.path, mode: "100644", type: "blob", sha: null })),
    ],
  });

  const result = { files: wanted.size, removed: removed.length };

  if (tree.sha === branch.treeSha) {
    await prisma.workspaceGit.update({
      where: { workspaceId },
      data: { lastSyncAt: new Date(), lastSyncAction: "push", lastCommit: branch.commitSha },
    });

    return { ...result, commit: branch.commitSha, changed: false };
  }

  const commit = await github<{ sha: string }>(target, "POST", "/git/commits", {
    message,
    tree: tree.sha,
    parents: [branch.commitSha],
  });

  // Not forced: when someone else pushed in the meantime GitHub refuses,
  // and nothing of theirs is overwritten
  await github(target, "PATCH", `/git/refs/heads/${encodeRef(target.branch)}`, { sha: commit.sha });

  await prisma.workspaceGit.update({
    where: { workspaceId },
    data: { lastSyncAt: new Date(), lastSyncAction: "push", lastCommit: commit.sha },
  });

  return { ...result, commit: commit.sha, changed: true };
};

const NODE_TYPES = new Set<string>(Object.values(NodeType));

/**
 * Makes the workspace's workflows what the branch's files say: a file of a
 * workflow the workspace has replaces its nodes and connections, any other
 * file becomes a new workflow (inactive). A workflow whose file is gone
 * from the branch is left alone and reported.
 */
export const pullWorkflows = async ({
  workspaceId,
  ownerId,
}: {
  workspaceId: string;
  ownerId: string;
}) => {
  const target = await loadGitTarget(workspaceId, ownerId);
  const branch = await readBranch(target);

  if (branch.files.length > GIT_MAX_WORKFLOWS) {
    throw new GitSyncError(`Git sync handles up to ${GIT_MAX_WORKFLOWS} workflow files.`);
  }

  const skipped: string[] = [];
  const parsed: WorkflowFile[] = [];

  const readable = branch.files.filter((entry) => {
    if ((entry.size ?? 0) <= GIT_MAX_FILE_BYTES) return true;

    skipped.push(`${entry.path}: larger than 1 MB`);
    return false;
  });

  // A few at a time: a pull has to fit in one request
  const texts: string[] = [];
  for (let start = 0; start < readable.length; start += READ_BATCH) {
    texts.push(
      ...(await Promise.all(
        readable.slice(start, start + READ_BATCH).map(async (entry) => {
          const blob = await github<{ content: string; encoding: string }>(target, "GET", `/git/blobs/${entry.sha}`);

          return Buffer.from(blob.content, blob.encoding === "base64" ? "base64" : "utf8").toString("utf8");
        })
      ))
    );
  }

  for (const [index, entry] of readable.entries()) {
    const result = parseWorkflowFile(texts[index]);

    if (!result.ok) {
      skipped.push(`${entry.path}: ${result.error}`);
    } else if (parsed.some((file) => file.id === result.file.id)) {
      skipped.push(`${entry.path}: another file has the same workflow id`);
    } else {
      parsed.push(result.file);
    }
  }

  const [existing, credentials, owner] = await Promise.all([
    prisma.workflow.findMany({
      where: { userId: ownerId },
      select: { id: true, name: true, gitSourceId: true },
    }),
    prisma.credential.findMany({
      where: { userId: ownerId },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, type: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { plan: true } }),
  ]);

  // A workflow that was made here and pushed has the file's id as its own;
  // one that came from a pull remembers the file's id
  const localId = new Map<string, string>();
  for (const workflow of existing) {
    localId.set(workflow.gitSourceId ?? workflow.id, workflow.id);
  }

  const toCreate = parsed.filter((file) => !localId.has(file.id));
  const limit = PLAN_LIMITS[owner.plan].activeWorkflows;

  if (existing.length + toCreate.length > limit) {
    throw new GitSyncError(
      `Not pulled: the branch has ${toCreate.length} workflow${toCreate.length === 1 ? "" : "s"} this workspace does not have yet, and its plan allows ${limit} workflows (it has ${existing.length}).`
    );
  }

  // New workflows get their id now, so a node that runs another workflow
  // of the same pull can name it
  const created = new Map<string, string>();
  for (const file of toCreate) {
    const row = await prisma.workflow.create({
      data: {
        name: file.name,
        userId: ownerId,
        workspaceId,
        gitSourceId: file.id,
        // Replaced below by the file's nodes; what a workflow whose file
        // could not be applied is left with
        nodes: { create: { type: NodeType.INITIAL, name: NodeType.INITIAL, position: { x: 0, y: 0 } } },
      },
      select: { id: true },
    });
    created.set(file.id, row.id);
    localId.set(file.id, row.id);
  }

  // The first credential of a type and name, when two have the same
  const credentialIds = new Map<string, string>();
  for (const credential of credentials) {
    const key = `${credential.type}\n${credential.name}`;
    if (!credentialIds.has(key)) credentialIds.set(key, credential.id);
  }

  const warnings: string[] = [];
  let updated = 0;

  for (const file of parsed) {
    const workflowId = localId.get(file.id) as string;

    const imported = fromWorkflowFile({
      file,
      workspaceId,
      keepNodeIds: workflowId === file.id,
      nodeTypes: NODE_TYPES,
      credentials: credentialIds,
      workflowIds: localId,
    });

    // A node id of the file that is in use by another workflow (a file
    // that was copied by hand): this file is not applied
    const taken = await prisma.node.findFirst({
      where: { id: { in: imported.nodes.map((node) => node.id) }, workflowId: { not: workflowId } },
      select: { id: true },
    });

    if (taken) {
      skipped.push(`"${file.name}": one of its node ids is used by another workflow`);
      continue;
    }

    await prisma.$transaction(async (tx) => {
      await tx.node.deleteMany({ where: { workflowId } });

      if (imported.nodes.length === 0) {
        // An empty canvas has its placeholder
        await tx.node.create({
          data: { workflowId, type: NodeType.INITIAL, name: NodeType.INITIAL, position: { x: 0, y: 0 } },
        });
      } else {
        await tx.node.createMany({
          data: imported.nodes.map((node) => ({
            id: node.id,
            workflowId,
            name: node.type,
            type: node.type as NodeType,
            position: node.position,
            data: node.data as Prisma.InputJsonValue,
            credentialId: node.credentialId,
          })),
        });
      }

      await tx.connection.createMany({
        data: imported.connections.map((connection) => ({ workflowId, ...connection })),
      });

      await tx.workflow.update({
        where: { id: workflowId },
        data: { name: file.name, updatedAt: new Date() },
      });
    });

    await removeStalePins(workflowId, imported.nodes.map((node) => node.id));

    // Version history: a pull is a change like a save, and can be undone
    await saveWorkflowVersion({
      workflowId,
      nodes: imported.nodes,
      connections: imported.connections,
    }).catch(() => undefined);

    if (!created.has(file.id)) updated += 1;

    for (const warning of imported.warnings) warnings.push(`"${file.name}" ${warning}`);
  }

  const inRepository = new Set(parsed.map((file) => file.id));
  const notInRepository = existing
    .filter((workflow) => !inRepository.has(workflow.gitSourceId ?? workflow.id))
    .map((workflow) => workflow.name);

  await prisma.workspaceGit.update({
    where: { workspaceId },
    data: { lastSyncAt: new Date(), lastSyncAction: "pull", lastCommit: branch.commitSha },
  });

  return {
    commit: branch.commitSha,
    created: created.size,
    updated,
    skipped,
    warnings: warnings.slice(0, 50),
    notInRepository,
  };
};
