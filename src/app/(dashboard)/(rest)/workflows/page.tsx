import { WorkflowsContainer, WorkflowsError, WorkflowsList, WorkflowsLoading } from '@/features/workflows/components/workflows'
import { workflowsParamsLoader } from '@/features/workflows/server/params-loader'
import { prefetchWorkflows } from '@/features/workflows/server/prefetch'
import { requireAuth } from '@/lib/auth-utils'
import { HydrateClient } from '@/trpc/server'
import { SearchParams } from 'nuqs/server'
import { Suspense } from 'react'
import { ErrorBoundary } from "react-error-boundary"
import { OnboardingChecklist } from "@/features/onboarding/components/onboarding-checklist"


type Props = {
  searchParams: Promise<SearchParams>
}

const Page = async ({ searchParams }: Props) => {
  await requireAuth()

  const params = await workflowsParamsLoader(searchParams)
  prefetchWorkflows(params)

  return (
    <WorkflowsContainer>
      <OnboardingChecklist />
      <HydrateClient>
        <ErrorBoundary fallback={<WorkflowsError />}>
          <Suspense fallback={<WorkflowsLoading />}>
            <WorkflowsList />
          </Suspense>
        </ErrorBoundary>
      </HydrateClient>
    </WorkflowsContainer>

  )
}

export default Page