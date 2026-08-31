import type { Prisma, PrismaClient } from "@prisma/client";

/**
 * REQ-YYYY-NNNN generator. Same pattern as vendor-brief numbers:
 * count-per-year + unique constraint + bounded retry at the call site.
 */
export async function generateRequestNumber(
  tx: Pick<PrismaClient | Prisma.TransactionClient, "creativeRequest">,
  year: number,
): Promise<string> {
  const count = await tx.creativeRequest.count({
    where: { requestNumber: { startsWith: `REQ-${year}-` } },
  });
  return formatRequestNumber(year, count + 1);
}

export function formatRequestNumber(year: number, sequence: number): string {
  return `REQ-${year}-${String(sequence).padStart(4, "0")}`;
}

export async function createWithNumberRetry<T>(
  attempt: (requestNumber: string) => Promise<T>,
  generate: () => Promise<string>,
  maxAttempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < maxAttempts; i++) {
    const requestNumber = await generate();
    try {
      return await attempt(requestNumber);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
      lastErr = err;
    }
  }
  throw lastErr;
}
