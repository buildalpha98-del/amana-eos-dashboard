import "@/lib/env"; // validate env vars on first import
import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
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

// ── Slow query logging (>500ms) ─────────────────────────────
if (process.env.NODE_ENV === "development") {
  (prisma as PrismaClient<{ log: [{ emit: "event"; level: "query" }] }>).$on(
    "query" as never,
    (e: { query: string; params: string; duration: number }) => {
      if (e.duration > 500) {
        console.warn(
          `[prisma:slow] ${e.duration}ms — ${e.query.slice(0, 200)}`,
        );
        if (e.params && e.params !== "[]") {
          console.warn(`  params: ${e.params.slice(0, 200)}`);
        }
      }
    },
  );
}

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
