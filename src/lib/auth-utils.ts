import "server-only"

import { redirect } from "next/navigation"
import { getRequestSession } from "./request-session"

export const requireAuth = async () => {
  const session = await getRequestSession()

  if (!session) redirect("/login")
  return session
}

export const requireUnauth = async () => {
  const session = await getRequestSession()

  if (session) redirect("/")
}
