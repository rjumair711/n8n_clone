import { CreateChatbot } from '@/features/chatbots/components/create-chatbot';
import { requireAuth } from '@/lib/auth-utils'

const Page = async () => {

  await requireAuth()

  return <CreateChatbot />
}

export default Page
