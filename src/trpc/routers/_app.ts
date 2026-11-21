import { workflowsRouter } from '@/features/workflows/server/routers';
import { createTRPCRouter } from '../init';
import { credentialsRouter } from '@/features/credentials/server/routers';
import { executionsRouter } from '@/features/executions/server/routers';
import { apiKeysRouter } from '@/features/api-keys/server/routers';
import { templatesRouter } from '@/features/templates/server/routers';
import { settingsRouter } from '@/features/settings/server/routers';
import { chatModelsRouter } from '@/features/executions/server/chat-models';
import { aiUsageRouter } from '@/features/ai-usage/server/routers';
import { approvalsRouter } from '@/features/approvals/server/routers';
import { aiBuilderRouter } from '@/features/ai-builder/server/routers';
import { aiCreditsRouter } from '@/features/ai-credits/server/routers';
import { chatbotsRouter } from '@/features/chatbots/server/routers';
import { evaluationsRouter } from '@/features/evaluations/server/routers';
import { workspacesRouter } from '@/features/workspaces/server/routers';
import { subscriptionRouter } from '@/features/subscription/server/routers';
import { memoryRouter } from '@/features/memory/server/routers';
import { onboardingRouter } from '@/features/onboarding/server/routers';
import { dataTablesRouter } from '@/features/data-tables/server/routers';
import { workflowFoldersRouter } from '@/features/workflows/server/folders';
import { managedServersRouter } from '@/features/managed-servers/server/routers';
import { supportRouter } from '@/features/support/server/routers';



export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  credentials: credentialsRouter,
  executions: executionsRouter,
  apiKeys: apiKeysRouter,
  templates: templatesRouter,
  settings: settingsRouter,
  chatModels: chatModelsRouter,
  aiUsage: aiUsageRouter,
  approvals: approvalsRouter,
  aiBuilder: aiBuilderRouter,
  aiCredits: aiCreditsRouter,
  chatbots: chatbotsRouter,
  evaluations: evaluationsRouter,
  workspaces: workspacesRouter,
  subscription: subscriptionRouter,
  memory: memoryRouter,
  onboarding: onboardingRouter,
  dataTables: dataTablesRouter,
  workflowFolders: workflowFoldersRouter,
  managedServers: managedServersRouter,
  support: supportRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;