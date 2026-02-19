import { requireAuth } from "@/lib/auth-utils"
import HomeClient from "./HomeClient"

export default async function Page() {
  await requireAuth()
  return <HomeClient />
}
