import { cache } from "react"
import { headers } from "next/headers"
import { auth } from "./auth"
import { perf } from "./perf"

/**
 * The session of the request being rendered. Cached for the request, so
 * the dashboard layout, the page and the tRPC prefetches of one server
 * render read it once. (Inside the tRPC route handler React's cache does
 * not apply: its context keeps the session for the request, see
 * src/trpc/init.ts.)
 */
export const getRequestSession = cache(async () =>
  perf("getSession", async () => auth.api.getSession({ headers: await headers() }))
)
