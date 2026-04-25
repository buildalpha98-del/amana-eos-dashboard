import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * Generate a human-readable VendorBrief number for a given year.
 *
 * Format: `VB-YYYY-NNNN` (e.g. `VB-2026-0042`), where NNNN is a zero-padded
 * sequence within the year. Counts existing briefs for that year and adds 1.
 *
 * Concurrency: technically racy under truly parallel creates. We mitigate
 * with a unique constraint on `briefNumber` plus retry-on-conflict at the
 * call site (see `createBriefWithNumber`). For Akram-only usage this is
 * effectively single-writer and the retry path almost never triggers.
 */
export async function generateBriefNumber(
  tx: Pick<PrismaClient | Prisma.TransactionClient, "vendorBrief">,
  year: number,
): Promise<string> {
  const count = await tx.vendorBrief.count({
    where: { briefNumber: { startsWith: `VB-${year}-` } },
  });
  return formatBriefNumber(year, count + 1);
}

export function formatBriefNumber(year: number, sequence: number): string {
  return `VB-${year}-${String(sequence).padStart(4, "0")}`;
}

/**
 * Helper to retry a create on briefNumber unique-constraint conflicts.
 * Maintains a small bounded retry count — beyond that it's a real bug.
 */
export async function createBriefWithNumberRetry<T>(
  attempt: (briefNumber: string) => Promise<T>,
  generate: () => Promise<string>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const briefNumber = await generate();
    try {
      return await attempt(briefNumber);
    } catch (err) {
      // Prisma P2002 = unique constraint violation
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
