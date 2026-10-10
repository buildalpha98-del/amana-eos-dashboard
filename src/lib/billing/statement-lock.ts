import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Statement creators and editors take the same centre lock before checking billed
 * sessions. ReadCommitted gives a waiter a fresh view after the first writer
 * commits. A transaction lock releases on rollback too, including with a
 * pooled connection. Keep the overlap check and the insert inside this work.
 */
export function withStatementLock<T>(
  serviceId: string,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`billing-statements:${serviceId}`}))`;
    return work(tx);
  }, {
    isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
    maxWait: 5_000,
    timeout: 30_000,
  });
}
