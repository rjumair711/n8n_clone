import { workflowsRouter } from '@/features/workflows/server/routers';
import { createTRPCRouter } from '../init';
import { credentialsRouter } from '@/features/credentials/server/routers';
import { executionsRouter } from '@/features/executions/server/routers';
import { apiKeysRouter } from '@/features/api-keys/server/routers';
import { templatesRouter } from '@/features/templates/server/routers';
import { settingsRouter } from '@/features/settings/server/routers';



export const appRouter = createTRPCRouter({
  workflows: workflowsRouter,
  credentials: credentialsRouter,
  executions: executionsRouter,
  apiKeys: apiKeysRouter,
  templates: templatesRouter,
  settings: settingsRouter,
});
// export type definition of API
export type AppRouter = typeof appRouter;