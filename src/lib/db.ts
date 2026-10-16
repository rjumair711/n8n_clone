import { PrismaClient } from "@prisma/client"
import { perfEnabled } from "./perf"

const globalForPrisma = global as unknown as {
  prisma: PrismaClient
}

// The app's queries go through Neon's connection pooler when
// DATABASE_POOLED_URL is set (the "-pooler" host). DATABASE_URL stays the
// direct connection: `prisma migrate deploy` needs it (see README).
const datasourceUrl = process.env.DATABASE_POOLED_URL || undefined

// PERF_LOG=1 (temporary): every query with its duration
const createPrisma = () => {
  if (!perfEnabled) return new PrismaClient({ datasourceUrl })

  const client = new PrismaClient({
    datasourceUrl,
    log: [{ emit: "event", level: "query" }],
  })
  client.$on("query", (event) => {
    console.log(`[perf] sql ${event.duration}ms ${event.query.replace(/\s+/g, " ").slice(0, 140)}`)
  })

  return client as unknown as PrismaClient
}

const prisma = globalForPrisma.prisma || createPrisma()

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}

export default prisma
