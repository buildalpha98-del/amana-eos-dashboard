import "@/lib/env"; // validate env vars on first import
import { PrismaClient } from "@prisma/client";
import { logger } from "@/lib/logger";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Append connection pool params for serverless if not already present
function buildDatasourceUrl(): string | undefined {
  const url = process.env.DATABASE_URL;
  if (!url || process.env.NODE_ENV === "development") return undefined;
  if (url.includes("connection_limit") || url.includes("pgbouncer")) return undefined;
  const separator = url.includes("?") ? "&" : "?";
  return `${url}${separator}connection_limit=5&pool_timeout=10`;
}

const datasourceUrl = buildDatasourceUrl();

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    ...(datasourceUrl ? { datasourceUrl } : {}),
    log:
      process.env.NODE_ENV === "development"
        ? [
            { emit: "event", level: "query" },
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ]
        : [
            { emit: "stdout", level: "warn" },
            { emit: "stdout", level: "error" },
          ],
  });

// ── Slow query logging (>500ms in dev) ──────────────────────
if (process.env.NODE_ENV === "development") {
  (prisma as PrismaClient<{ log: [{ emit: "event"; level: "query" }] }>).$on(
    "query" as never,
    (e: { query: string; params: string; duration: number }) => {
      if (e.duration > 500) {
        logger.warn(`[prisma:slow] ${e.duration}ms`, {
          query: e.query.slice(0, 200),
          params: e.params && e.params !== "[]" ? e.params.slice(0, 200) : undefined,
        });
      }
    },
  );
}

// ── Graceful shutdown ───────────────────────────────────────
// Drains connection pool on clean process exit. Primarily benefits
// the local dev server — in Vercel serverless, processes are frozen
// (not exited), so `beforeExit` does not fire. Connection pooling
// params above handle serverless lifecycle instead.
async function shutdown() {
  await prisma.$disconnect();
}

process.on("beforeExit", shutdown);

// In development, cache the client to survive HMR reloads
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
