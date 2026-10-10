import { Settings } from '@/features/settings/components/settings';
import { requireAuth } from '@/lib/auth-utils'

const Page = async () => {

  await requireAuth()

  return <Settings />
}

export default Page
