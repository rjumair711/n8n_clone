import { ApiKeys } from '@/features/api-keys/components/api-keys';
import { requireAuth } from '@/lib/auth-utils'

const Page = async () => {

  await requireAuth()

  return <ApiKeys />
}

export default Page
