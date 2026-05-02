import { ExecutionView } from "@/features/executions/components/execution";
import { ExecutionError, ExecutionLoading } from "@/features/executions/components/executions";
import { prefetchExecution } from "@/features/executions/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { ErrorBoundary } from "@sentry/nextjs";
import { Suspense } from "react";

interface PageProps {
    params: Promise<{
        executionId: string
    }>
}

const Page = async ({ params }: PageProps) => {
    await requireAuth()
    const { executionId } = await params;
    prefetchExecution(executionId)

    return (
        <div className="p-4 md:px-10 md:py-6 h-full">
            <div className="mx-auto max-w-3xl w-full gap-y-8 h-full flex flex-col ">
                <HydrateClient>
                    <ErrorBoundary fallback={<ExecutionError />}>
                        <Suspense fallback={<ExecutionLoading />}>
                            <ExecutionView executionId={executionId} />
                        </Suspense>
                    </ErrorBoundary>
                </HydrateClient>
            </div>
        </div>
    )
}

export default Page