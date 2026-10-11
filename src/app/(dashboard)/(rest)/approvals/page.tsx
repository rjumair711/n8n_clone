import { ApprovalsPage } from '@/features/approvals/components/pending-approvals';
import { requireAuth } from '@/lib/auth-utils'

const Page = async () => {

  await requireAuth()

  return <ApprovalsPage />
}

export default Page
