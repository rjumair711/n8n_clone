import { ChatbotDetails } from '@/features/chatbots/components/chatbot-details';
import { requireAuth } from '@/lib/auth-utils'

interface PageProps {
  params: Promise<{ chatbotId: string }>
}

const Page = async ({ params }: PageProps) => {

  await requireAuth()

  const { chatbotId } = await params

  return <ChatbotDetails id={chatbotId} />
}

export default Page
