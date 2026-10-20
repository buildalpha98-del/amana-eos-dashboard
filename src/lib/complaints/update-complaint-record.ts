import type { ComplaintRecord, Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { COMPLAINT_STATUSES, NOTIFIABLE_REASONS } from "@/lib/complaint-reference";
import { notificationDueAt } from "@/lib/compliance-clocks";

const reasons = NOTIFIABLE_REASONS.map((r) => r.value) as [string, ...string[]];

export const complaintPatchSchema = z.object({
  status: z.enum(COMPLAINT_STATUSES).optional(),
  assignedToId: z.string().nullable().optional(),
  acknowledgedAt: z.string().nullable().optional(),
  investigationNotes: z.string().trim().max(20000).nullable().optional(),
  outcome: z.string().trim().max(10000).nullable().optional(),
  /** Lodging the notification: when, and the NQA ITS reference. */
  regulatorNotifiedAt: z.string().nullable().optional(),
  regulatorReference: z.string().trim().max(120).nullable().optional(),
  /** A complaint can turn out to be notifiable after intake. */
  notifiable: z.boolean().optional(),
  notifiableReason: z.enum(reasons).nullable().optional(),
  becameAwareAt: z.string().nullable().optional(),
});

export type ComplaintPatch = z.infer<typeof complaintPatchSchema>;

/**
 * The ONE write path for a complaint edit. The PATCH route and Knox's
 * approve path both call this, so the "needs a reason" rule, the 24-hour
 * deadline stamping and the resolver stamp apply to both.
 *
 * Auth and centre scope stay with the caller; `existing` is the row the
 * caller already loaded and scoped.
 */
export async function updateComplaintRecord(
  db: PrismaClient | Prisma.TransactionClient,
  id: string,
  patch: ComplaintPatch,
  actor: { id: string },
  existing: { notifiable: boolean; becameAwareAt: Date | null },
): Promise<
  Pick<
    ComplaintRecord,
    "id" | "reference" | "status" | "notificationDueAt" | "regulatorNotifiedAt" | "notifiable"
  >
> {
  const d = patch;

  const becomingNotifiable = d.notifiable === true && !existing.notifiable;
  if (becomingNotifiable && d.notifiableReason === undefined) {
    throw ApiError.badRequest(
      "Marking a complaint notifiable needs a reason — serious incident, or breach of the Law?",
    );
  }

  /**
   * Re-stamp the deadline only when the awareness date moves, or when
   * a complaint becomes notifiable and never had one.
   *
   * Deliberately NOT recalculated on every save: a complaint that was
   * notified late must keep showing as late, and a deadline that
   * quietly recomputes would erase that.
   */
  let dueAtPatch: { notificationDueAt?: Date | null } = {};
  if (d.becameAwareAt !== undefined) {
    const aware = d.becameAwareAt ? new Date(d.becameAwareAt) : null;
    if (aware && Number.isNaN(aware.getTime())) {
      throw ApiError.badRequest("That awareness date isn't a real date");
    }
    dueAtPatch = { notificationDueAt: aware ? notificationDueAt(aware) : null };
  } else if (becomingNotifiable) {
    dueAtPatch = {
      notificationDueAt: notificationDueAt(existing.becameAwareAt ?? new Date()),
    };
  }

  const resolving = d.status === "resolved" || d.status === "closed";

  return db.complaintRecord.update({
    where: { id },
    data: {
      ...(d.status !== undefined ? { status: d.status } : {}),
      ...(d.assignedToId !== undefined ? { assignedToId: d.assignedToId } : {}),
      ...(d.acknowledgedAt !== undefined
        ? {
            acknowledgedAt: d.acknowledgedAt
              ? new Date(d.acknowledgedAt)
              : null,
          }
        : {}),
      ...(d.investigationNotes !== undefined
        ? { investigationNotes: d.investigationNotes }
        : {}),
      ...(d.outcome !== undefined ? { outcome: d.outcome } : {}),
      ...(d.regulatorNotifiedAt !== undefined
        ? {
            regulatorNotifiedAt: d.regulatorNotifiedAt
              ? new Date(d.regulatorNotifiedAt)
              : null,
          }
        : {}),
      ...(d.regulatorReference !== undefined
        ? { regulatorReference: d.regulatorReference }
        : {}),
      ...(d.notifiable !== undefined ? { notifiable: d.notifiable } : {}),
      ...(d.notifiableReason !== undefined
        ? { notifiableReason: d.notifiableReason }
        : {}),
      ...(d.becameAwareAt !== undefined
        ? {
            becameAwareAt: d.becameAwareAt
              ? new Date(d.becameAwareAt)
              : null,
          }
        : {}),
      ...dueAtPatch,
      // Stamped by the transition rather than sent by the client, so
      // "who closed this and when" can't be back-dated from the UI.
      ...(resolving
        ? { resolvedAt: new Date(), resolvedById: actor.id }
        : {}),
    },
    select: {
      id: true,
      reference: true,
      status: true,
      notificationDueAt: true,
      regulatorNotifiedAt: true,
      notifiable: true,
    },
  });
}
