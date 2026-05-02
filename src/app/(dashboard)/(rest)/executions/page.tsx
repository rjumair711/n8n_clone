import { ExecutionError, ExecutionLoading, ExecutionsContainer, ExecutionsList } from '@/features/executions/components/executions';
import { executionsParamsLoader } from '@/features/executions/server/params-loader';
import { prefetchExecutions } from '@/features/executions/server/prefetch';
import { requireAuth } from '@/lib/auth-utils'
import { HydrateClient } from '@/trpc/server';
import { ErrorBoundary } from '@sentry/nextjs';
import { SearchParams } from 'nuqs'
import { Suspense } from 'react';


type Props = {
  searchParams: Promise<SearchParams>;
}

const Page = async ({ searchParams }: Props) => {

  await requireAuth()

  const params = await executionsParamsLoader(searchParams);
  prefetchExecutions(params);

  return (
    <ExecutionsContainer>
      <HydrateClient>
        <ErrorBoundary fallback={<ExecutionError />}>
          <Suspense fallback={<ExecutionLoading />}>
            <ExecutionsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </ExecutionsContainer>
  )
}

export default Page