import { Editor, EditorError, EditorLoading } from "@/features/editor/components/editor";
import { EditorHeader } from "@/features/editor/components/editor-header";
import { WorkflowsError, WorkflowsLoading } from "@/features/workflows/components/workflows";
import { prefetchWorkflow } from "@/features/workflows/server/prefetch";
import { requireAuth } from "@/lib/auth-utils";
import { HydrateClient } from "@/trpc/server";
import { Suspense } from "react";
import { ErrorBoundary } from "react-error-boundary"

interface PageProps {
    params: Promise<{
        workflowId: string
    }>
}


const Page = async ({ params }: PageProps) => {
    await requireAuth()

    const { workflowId } = await params;
    prefetchWorkflow(workflowId)


    return (
        <HydrateClient>
            <ErrorBoundary fallback={<EditorError />}>
                <Suspense fallback={<EditorLoading />}>
                    {/* Exactly one viewport tall: the page never scrolls, only the logs list does */}
                    <div className="flex h-dvh min-w-0 flex-col overflow-hidden">
                        <EditorHeader workflowId={workflowId} />
                        <main className="min-h-0 min-w-0 flex-1 overflow-hidden">
                            <Editor workflowId={workflowId} />
                        </main>
                    </div>
                </Suspense>
            </ErrorBoundary>
        </HydrateClient>
    )
}

export default Page