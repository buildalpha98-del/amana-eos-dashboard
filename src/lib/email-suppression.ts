import { prisma } from "@/lib/prisma";

/**
 * Check whether an email address is on the suppression list.
 */
export async function isEmailSuppressed(email: string): Promise<boolean> {
  const entry = await prisma.emailSuppression.findUnique({
    where: { email: email.toLowerCase() },
  });
  return !!entry;
}

/**
 * Add an email to the suppression list (e.g. after a bounce or complaint).
 * No-op if already suppressed.
 */
export async function suppressEmail(
  email: string,
  reason: string,
  source?: string,
): Promise<void> {
  await prisma.emailSuppression.upsert({
    where: { email: email.toLowerCase() },
    update: {}, // already suppressed — don't overwrite
    create: {
      email: email.toLowerCase(),
      reason,
      source: source ?? null,
    },
  });
}

/**
 * Return the full suppression list for admin review.
 */
export async function getSuppressionList() {
  return prisma.emailSuppression.findMany({
    orderBy: { createdAt: "desc" },
  });
}

/**
 * Remove an email from the suppression list (e.g. admin override).
 */
export async function removeFromSuppressionList(email: string): Promise<void> {
  await prisma.emailSuppression.deleteMany({
    where: { email: email.toLowerCase() },
  });
}

/**
 * Batch variant of isEmailSuppressed — one findMany instead of N findUniques.
 * Returns the lowercased subset of `emails` that is suppressed.
 */
export async function getSuppressedEmails(emails: string[]): Promise<Set<string>> {
  const lowered = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (lowered.length === 0) return new Set();
  const rows = await prisma.emailSuppression.findMany({
    where: { email: { in: lowered } },
    select: { email: true },
  });
  return new Set(rows.map((r) => r.email));
}
