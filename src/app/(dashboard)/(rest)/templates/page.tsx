import { Templates } from '@/features/templates/components/templates';
import { requireAuth } from '@/lib/auth-utils'
import { HydrateClient, getQueryClient, trpc } from '@/trpc/server'

const Page = async () => {

  await requireAuth()

  // Fetched with the page (same session lookup as the layout), so the
  // gallery does not wait for the browser to ask for it
  await getQueryClient().prefetchQuery(trpc.templates.getMany.queryOptions())

  return (
    <HydrateClient>
      <Templates />
    </HydrateClient>
  )
}

export default Page
