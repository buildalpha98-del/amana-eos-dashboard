/**
 * GET/PATCH /api/compliance/complaints/[id]
 *
 * Working one complaint: acknowledging it, investigating, recording the
 * regulator notification, and closing it out.
 *
 * `investigationNotes` and `outcome` are separate fields on purpose.
 * Notes are what we write for ourselves; outcome is what the complainant
 * is told. Merging them is how internal speculation ends up quoted back
 * at a service — so the parent-facing read path returns `outcome` and
 * never `investigationNotes`.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import {
  COMPLAINT_STATUSES,
  NOTIFIABLE_REASONS,
} from "@/lib/complaint-reference";
import { clockStatus, notificationDueAt } from "@/lib/compliance-clocks";

const reasons = NOTIFIABLE_REASONS.map((r) => r.value) as [string, ...string[]];

const patchSchema = z.object({
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

async function loadScoped(id: string, session: Parameters<typeof getCentreScope>[0]) {
  const row = await prisma.complaintRecord.findUnique({
    where: { id },
    select: { id: true, serviceId: true, notifiable: true, becameAwareAt: true },
  });
  if (!row) throw ApiError.notFound("Complaint not found");

  const { serviceIds } = await getCentreScope(session);
  if (serviceIds !== null && !serviceIds.includes(row.serviceId)) {
    // 404 rather than 403 — whether another centre has a complaint about
    // a named staff member is itself information.
    throw ApiError.notFound("Complaint not found");
  }
  return row;
}

export const GET = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    await loadScoped(id, session);

    const row = await prisma.complaintRecord.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true } },
        assignedTo: { select: { id: true, name: true } },
        resolvedBy: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        child: { select: { id: true, firstName: true, surname: true } },
      },
    });

    return NextResponse.json({
      complaint: {
        ...row,
        clock: clockStatus(row!.notificationDueAt, row!.regulatorNotifiedAt),
      },
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const existing = await loadScoped(id, session);

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid change", parsed.error.flatten());
    }
    const d = parsed.data;

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

    const updated = await prisma.complaintRecord.update({
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
          ? { resolvedAt: new Date(), resolvedById: session!.user.id }
          : {}),
      },
      select: {
        id: true,
        reference: true,
        status: true,
        notificationDueAt: true,
        regulatorNotifiedAt: true,
      },
    });

    return NextResponse.json({
      complaint: {
        ...updated,
        clock: clockStatus(updated.notificationDueAt, updated.regulatorNotifiedAt),
      },
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
