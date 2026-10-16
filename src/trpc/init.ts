import { initTRPC, TRPCError } from '@trpc/server';
import { cache } from 'react';
import superjson from "superjson"
import { polarClient } from '@/lib/polar';
import { PRODUCTION_MESSAGE, isProductionWorkspace, resolveWorkspace, type ActiveWorkspace } from '@/lib/workspaces';
import { getRequestSession } from '@/lib/request-session';
import { hasRole, roleError, type WorkspaceRole } from '@/lib/workspace-roles';
import { perf, perfEnabled } from '@/lib/perf';


type Session = NonNullable<Awaited<ReturnType<typeof getRequestSession>>>;

export type TRPCContext = {
  userId: string;
  // Only set by server-side callers that already know who is calling (the
  // tenant isolation script). Requests from the browser never set it: their
  // context is made by createTRPCContext below, and the session is read
  // from the request's cookies.
  session?: Session;
  // With `session`: the workspace that caller works in. Left out, it is
  // the session user's own.
  workspaceId?: string | null;
  // A browser request: its session, read once however many procedures
  // the request (a batch) runs
  getSession?: () => Promise<Session | null>;
  // The workspace of the request, looked up once and shared by its
  // procedures. Membership and role are still read on every request.
  memo?: { workspace?: Promise<ActiveWorkspace> };
};

const once = <T,>(load: () => Promise<T>) => {
  let pending: Promise<T> | null = null;

  return () => (pending ??= load());
};

export const createTRPCContext = cache(async (): Promise<TRPCContext> => {
  /**
   * @see: https://trpc.io/docs/server/context
   */
  return {
    userId: 'user_123',
    getSession: once(() => getRequestSession()),
    memo: {},
  };
});
// Avoid exporting the entire t-object
// since it's not very descriptive.
// For instance, the use of a t variable
// is common in i18n libraries.
const t = initTRPC.context<TRPCContext>().create({
  /**
   * @see https://trpc.io/docs/server/data-transformers
   */
   transformer: superjson,
});
// Base router and procedure helpers
export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
// PERF_LOG=1 (temporary): how long each procedure takes, middlewares included
export const baseProcedure = t.procedure.use(async ({ path, type, next }) => {
  if (!perfEnabled) return next()

  const start = performance.now()
  const result = await next()
  console.log(`[perf] trpc ${type} ${path} ${(performance.now() - start).toFixed(1)}ms${result.ok ? '' : ' (error)'}`)

  return result
});
export const protectedProcedure = baseProcedure.use(async ({ ctx, next }) => {
  const session =
    ctx.session ??
    (await (ctx.getSession ?? getRequestSession)())

  if (!session) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Unathorized",
    })
  }

  return next({ ctx: { ...ctx, auth: session } })
})

// WORKSPACE PROCEDURES
// Everything that belongs to a workspace (workflows, credentials,
// executions, usage...) is reached through one of these. `ctx.workspace`
// is the workspace the request works in and the caller's role in it; its
// `ownerId` is the user id the workspace's data is stored under. Use that
// for data, and `ctx.auth.user` only for who is calling.
//
// protectedProcedure stays for what is the user's own whatever workspace
// they are in: their sessions, two-factor, API keys.
const workspaceProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const resolve = () => perf('trpc resolveWorkspace', () => resolveWorkspace(
    ctx.auth.user,
    // A server-side caller says which workspace; a browser's cookie is read
    ctx.session ? (ctx.workspaceId ?? null) : undefined
  ))
  const workspace = await (ctx.memo ? (ctx.memo.workspace ??= resolve()) : resolve())

  return next({ ctx: { ...ctx, workspace } })
})

const requireRole = (needed: WorkspaceRole) =>
  workspaceProcedure.use(({ ctx, next }) => {
    if (!hasRole(ctx.workspace.role, needed)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: roleError(ctx.workspace.role, needed),
      })
    }

    return next()
  })

// Reads
export const viewerProcedure = requireRole("VIEWER")
// Builds and runs workflows
export const editorProcedure = requireRole("EDITOR")
// Builds or changes workflows by hand. Refused in a production workspace,
// where workflows only change by a pull from Git; running a workflow and
// turning it on or off use editorProcedure.
export const builderProcedure = editorProcedure.use(({ ctx, next }) => {
  if (isProductionWorkspace(ctx.workspace)) {
    throw new TRPCError({ code: "FORBIDDEN", message: PRODUCTION_MESSAGE })
  }

  return next()
})
// Credentials, budgets, members
export const workspaceAdminProcedure = requireRole("ADMIN")
export const ownerProcedure = requireRole("OWNER")


export const premiumProcedure =
  protectedProcedure.use(
    async ({ ctx, next }) => {
      const customer =
        await polarClient.customers.getStateExternal({
          externalId: ctx.auth.user.id,
        });

      const hasSubscription =
        customer.activeSubscriptions &&
        customer.activeSubscriptions.length > 0;

      if (!hasSubscription) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message:
            "Premium subscription required",
        });
      }

      return next({
        ctx: {
          ...ctx,
          customer,
        },
      });
    }
  );