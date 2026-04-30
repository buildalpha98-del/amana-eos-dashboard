import type { Prisma, PrismaClient } from "@prisma/client";

type TxClient =
  | PrismaClient
  | Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

/**
 * Appends a `CentreAvatarUpdateLog` row. Every write to an Avatar's living
 * logs should go through here so the update-log stays the single source of
 * truth for audit history.
 */
export async function appendUpdateLog(
  tx: TxClient,
  params: {
    centreAvatarId: string;
    userId: string;
    sectionsChanged: string[];
    summary: string;
    occurredAt?: Date;
  },
): Promise<void> {
  const data: Prisma.CentreAvatarUpdateLogCreateInput = {
    centreAvatar: { connect: { id: params.centreAvatarId } },
    occurredAt: params.occurredAt ?? new Date(),
    sectionsChanged: params.sectionsChanged,
    summary: params.summary,
    updatedBy: { connect: { id: params.userId } },
  };
  await tx.centreAvatarUpdateLog.create({ data });
}
