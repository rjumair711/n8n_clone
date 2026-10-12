import { Evaluations } from '@/features/evaluations/components/evaluations';
import { requireAuth } from '@/lib/auth-utils'

interface PageProps {
  params: Promise<{ workflowId: string }>
}

const Page = async ({ params }: PageProps) => {

  await requireAuth()

  const { workflowId } = await params

  return <Evaluations workflowId={workflowId} />
}

export default Page
