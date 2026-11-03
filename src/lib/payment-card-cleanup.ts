import type { Prisma, PrismaClient } from "@prisma/client";

/** Compare-and-set cleanup. A bank edit after inventory always wins. */
export async function applyCardCleanup(db: PrismaClient, actorId: string, plan: {
  id: string; paymentMethod: string | null; original: Prisma.InputJsonValue;
  cleaned: Prisma.InputJsonValue; cardKeyNames: string[];
}): Promise<boolean> {
  if (plan.paymentMethod === "bank_account") return false;
  return db.$transaction(async tx => {
    const result = await tx.enrolmentSubmission.updateMany({
      where: { id: plan.id, paymentMethod: plan.paymentMethod, paymentDetails: { equals: plan.original } },
      data: { paymentDetails: plan.cleaned },
    });
    if (result.count !== 1) return false;
    await tx.activityLog.create({ data: {
      userId: actorId, action: "payment_card_data_removed",
      entityType: "EnrolmentSubmission", entityId: plan.id,
      details: { removed: plan.cardKeyNames, kept: Object.keys(plan.cleaned as object).sort() },
    } });
    return true;
  });
}
