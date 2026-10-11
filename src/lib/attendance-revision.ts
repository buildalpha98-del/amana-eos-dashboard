import { createHash } from "node:crypto";
import type { AttendanceRecord, Prisma, SessionType } from "@prisma/client";
import { ApiError } from "@/lib/api-error";

/** Opaque snapshot token, including meaningful fields even within one millisecond. */
export function attendanceRevision(record: AttendanceRecord): string {
  return createHash("sha256")
    .update(
      JSON.stringify([
        record.id,
        record.updatedAt,
        record.status,
        record.signInTime,
        record.signOutTime,
        record.signedInById,
        record.signedOutById,
        record.signedInByName,
        record.signedOutByName,
        record.signedInMethod,
        record.signedOutMethod,
        record.signedInSignature,
        record.signedOutSignature,
        record.absenceReason,
        record.notes,
      ]),
    )
    .digest("hex");
}

interface RevisionInput {
  childId: string;
  serviceId: string;
  date: Date;
  sessionType: SessionType;
  roomId: string;
  actorId: string;
  action: string;
  clientMutationId?: string;
  expectedRevision?: string | null;
  dependsOnMutationId?: string;
}

const conflict = () =>
  ApiError.conflict(
    "Attendance has changed or this saved action needs review. Refresh the roll and check the child’s record before trying again.",
  );

/** Inside the receipt transaction, before any attendance write. */
export async function assertAttendanceRevision(
  tx: Prisma.TransactionClient,
  input: RevisionInput,
) {
  // Older direct/bulk callers are migrated separately. New queued requests
  // without a baseline must fail closed, unless already acknowledged by a receipt.
  if (!input.clientMutationId) return;
  let expected = input.expectedRevision;
  if (input.dependsOnMutationId) {
    const prior = await tx.attendanceMutation.findUnique({
      where: { id: input.dependsOnMutationId },
    });
    if (
      !prior ||
      prior.actorId !== input.actorId ||
      prior.childId !== input.childId ||
      prior.serviceId !== input.serviceId ||
      prior.date.getTime() !== input.date.getTime() ||
      prior.sessionType !== input.sessionType ||
      !prior.response ||
      typeof prior.response !== "object" ||
      Array.isArray(prior.response) ||
      typeof prior.response.recordRevision !== "string"
    )
      throw conflict();
    expected = prior.response.recordRevision;
  }
  if (expected === undefined) throw conflict();
  const { childId, serviceId, date, sessionType, roomId } = input;
  const key = { childId, serviceId, date, sessionType };
  if (expected === null) {
    if (input.action === "note") {
      throw ApiError.badRequest(
        "Sign the child in or mark them absent before adding a note.",
      );
    }
    if (input.action === "sign_out") throw conflict();
    // Claim the absent row atomically. Competing inserts, including legacy
    // writers, serialize through the existing unique constraint. The placeholder
    // disappears if validation or the action later rolls back.
    const created = await tx.attendanceRecord.createMany({
      data: [{ ...key, roomId, status: "booked" }],
      skipDuplicates: true,
    });
    if (created.count !== 1) throw conflict();
    return;
  }
  // Ordinary UPDATE/DELETE from every writer takes this row lock too. Read the
  // latest committed snapshot after acquiring it; hold it through receipt commit.
  await tx.$queryRaw`SELECT "id" FROM "AttendanceRecord"
    WHERE "childId" = ${childId} AND "serviceId" = ${serviceId}
      AND "date" = ${date}::date AND "sessionType" = ${sessionType}::"SessionType"
    FOR UPDATE`;
  const current = await tx.attendanceRecord.findUnique({
    where: { childId_serviceId_date_sessionType: key },
  });
  if (!current || attendanceRevision(current) !== expected) throw conflict();
}
