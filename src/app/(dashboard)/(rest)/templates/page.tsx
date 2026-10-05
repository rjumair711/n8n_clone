import { Templates } from '@/features/templates/components/templates';
import { requireAuth } from '@/lib/auth-utils'

const Page = async () => {

  await requireAuth()

  return <Templates />
}

export default Page
