import { createHash } from "node:crypto";
import { Prisma, type SessionType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import type { HandoverInput } from "@/lib/attendance-handover";

interface MutationInput {
  clientMutationId?: string;
  serviceId: string;
  childId: string;
  actorId: string;
  date: Date;
  sessionType: SessionType;
  action: string;
  /** Validated, schema-ordered request, before server time clamping. */
  payload: object;
}

interface MutationResult {
  response: Prisma.InputJsonValue;
  notification?: HandoverInput;
}

/** Caller must validate current service/child access before consulting a receipt. */
export async function runAttendanceMutation(
  input: MutationInput,
  write: (tx: Prisma.TransactionClient) => Promise<MutationResult>,
) {
  const { clientMutationId: id, payload, ...scope } = input;
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  return prisma.$transaction(
    async (tx): Promise<MutationResult> => {
      if (id) {
        // A competing INSERT waits for the first transaction to commit or roll
        // back. ReadCommitted then reads its completed receipt, without P2002
        // poisoning this transaction. Failed writes roll back their claim too.
        const claim = await tx.attendanceMutation.createMany({
          data: [{ id, ...scope, fingerprint }],
          skipDuplicates: true,
        });
        if (claim.count === 0) {
          const saved = await tx.attendanceMutation.findUnique({
            where: { id },
          });
          if (
            !saved ||
            saved.actorId !== scope.actorId ||
            saved.serviceId !== scope.serviceId ||
            saved.childId !== scope.childId ||
            saved.date.getTime() !== scope.date.getTime() ||
            saved.sessionType !== scope.sessionType ||
            saved.action !== scope.action ||
            saved.fingerprint !== fingerprint ||
            saved.response === null
          ) {
            throw ApiError.conflict(
              "This saved action does not match its original record. Review the attendance record before trying again.",
            );
          }
          // The historical response is returned without rewriting today's state
          // or sending another notification, including after undo/correction.
          return { response: saved.response as Prisma.InputJsonValue };
        }
      }
      const result = await write(tx);
      if (id)
        await tx.attendanceMutation.update({
          where: { id },
          data: { response: result.response },
        });
      return result;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted },
  );
}
