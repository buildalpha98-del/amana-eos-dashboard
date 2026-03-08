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
