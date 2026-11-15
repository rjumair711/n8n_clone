import { TRPCError } from "@trpc/server";
import z from "zod";
import prisma from "@/lib/db";
import { assertOwnership } from "@/lib/ownership";
import { builderProcedure, createTRPCRouter, editorProcedure, viewerProcedure } from "@/trpc/init";
import {
  MAX_FOLDERS,
  MAX_TAGS,
  OrganizeError,
  normalizeFolderName,
  parseTagList,
} from "../lib/workflow-organize";

// Folders and tags of the workspace owner's workflows. Creating and
// removing folders is for builders; filing and tagging a workflow is an
// edit of it.

const badRequest = (error: unknown): never => {
  if (error instanceof OrganizeError) throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  throw error;
};

const isUniqueViolation = (error: unknown) =>
  typeof error === "object" && error !== null && (error as { code?: string }).code === "P2002";

const ownedWorkflow = async (id: string, ownerId: string) =>
  assertOwnership(await prisma.workflow.findUnique({ where: { id } }), ownerId, "Workflow");

export const workflowFoldersRouter = createTRPCRouter({
  list: viewerProcedure.query(async ({ ctx }) => {
    const userId = ctx.workspace.ownerId;
    const [folders, tags, unfiled] = await Promise.all([
      prisma.workflowFolder.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { workflows: true } } },
      }),
      prisma.workflowTag.findMany({
        where: { userId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, _count: { select: { workflows: true } } },
      }),
      prisma.workflow.count({ where: { userId, folderId: null } }),
    ]);
    return {
      folders: folders.map((folder) => ({ id: folder.id, name: folder.name, count: folder._count.workflows })),
      tags: tags.map((tag) => ({ id: tag.id, name: tag.name, count: tag._count.workflows })),
      unfiled,
    };
  }),

  createFolder: builderProcedure
    .input(z.object({ name: z.string().max(200) }))
    .mutation(async ({ ctx, input }) => {
      const name = (() => { try { return normalizeFolderName(input.name); } catch (error) { return badRequest(error); } })();
      const userId = ctx.workspace.ownerId;
      if ((await prisma.workflowFolder.count({ where: { userId } })) >= MAX_FOLDERS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `At most ${MAX_FOLDERS} folders` });
      }
      try {
        return await prisma.workflowFolder.create({ data: { userId, name }, select: { id: true, name: true } });
      } catch (error) {
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: `There is already a folder "${name}"` });
        throw error;
      }
    }),

  renameFolder: builderProcedure
    .input(z.object({ id: z.string(), name: z.string().max(200) }))
    .mutation(async ({ ctx, input }) => {
      const name = (() => { try { return normalizeFolderName(input.name); } catch (error) { return badRequest(error); } })();
      try {
        const updated = await prisma.workflowFolder.updateMany({
          where: { id: input.id, userId: ctx.workspace.ownerId },
          data: { name },
        });
        if (updated.count === 0) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
        return { id: input.id, name };
      } catch (error) {
        if (isUniqueViolation(error)) throw new TRPCError({ code: "CONFLICT", message: `There is already a folder "${name}"` });
        throw error;
      }
    }),

  // The workflows in it stay, outside any folder
  deleteFolder: builderProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const removed = await prisma.workflowFolder.deleteMany({
        where: { id: input.id, userId: ctx.workspace.ownerId },
      });
      return { deleted: removed.count };
    }),

  moveWorkflow: editorProcedure
    .input(z.object({ workflowId: z.string(), folderId: z.string().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = ctx.workspace.ownerId;
      await ownedWorkflow(input.workflowId, ownerId);
      if (input.folderId) {
        const folder = await prisma.workflowFolder.findFirst({ where: { id: input.folderId, userId: ownerId } });
        if (!folder) throw new TRPCError({ code: "NOT_FOUND", message: "Folder not found" });
      }
      // Filing a workflow is not a change to it: its "Updated" time stays
      await prisma.$executeRaw`UPDATE "Workflow" SET "folderId" = ${input.folderId} WHERE "id" = ${input.workflowId} AND "userId" = ${ownerId}`;
      return { workflowId: input.workflowId, folderId: input.folderId };
    }),

  // Replaces the workflow's tags; names that are new become tags
  setTags: editorProcedure
    .input(z.object({ workflowId: z.string(), names: z.array(z.string().max(100)).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = ctx.workspace.ownerId;
      await ownedWorkflow(input.workflowId, ownerId);
      const names = (() => { try { return parseTagList(input.names); } catch (error) { return badRequest(error); } })();

      const existing = await prisma.workflowTag.findMany({ where: { userId: ownerId, name: { in: names } } });
      const missing = names.filter((name) => !existing.some((tag) => tag.name === name));
      if (missing.length && (await prisma.workflowTag.count({ where: { userId: ownerId } })) + missing.length > MAX_TAGS) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `At most ${MAX_TAGS} tags` });
      }
      if (missing.length) {
        await prisma.workflowTag.createMany({
          data: missing.map((name) => ({ userId: ownerId, name })),
          skipDuplicates: true,
        });
      }
      const tags = await prisma.workflowTag.findMany({ where: { userId: ownerId, name: { in: names } }, select: { id: true, name: true } });

      await prisma.$transaction([
        prisma.workflowTagLink.deleteMany({ where: { workflowId: input.workflowId } }),
        prisma.workflowTagLink.createMany({
          data: tags.map((tag) => ({ workflowId: input.workflowId, tagId: tag.id })),
        }),
      ]);
      return { workflowId: input.workflowId, tags };
    }),

  // From every workflow that has it
  deleteTag: builderProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const removed = await prisma.workflowTag.deleteMany({ where: { id: input.id, userId: ctx.workspace.ownerId } });
      return { deleted: removed.count };
    }),
});
