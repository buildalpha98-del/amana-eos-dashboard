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
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { clockStatus } from "@/lib/compliance-clocks";
import { complaintTriggerChanged, triggerTriage } from "@/lib/knox/trigger";
import {
  complaintPatchSchema,
  updateComplaintRecord,
} from "@/lib/complaints/update-complaint-record";

async function loadScoped(id: string, session: Parameters<typeof getCentreScope>[0]) {
  const row = await prisma.complaintRecord.findUnique({
    where: { id },
    select: {
      id: true,
      serviceId: true,
      notifiable: true,
      becameAwareAt: true,
      // The fields Knox's rules read; compared against the patch in PATCH.
      notifiableReason: true,
      category: true,
      status: true,
    },
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

    const parsed = complaintPatchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid change", parsed.error.flatten());
    }

    const knoxRelevant = complaintTriggerChanged(existing, parsed.data);

    const updated = await updateComplaintRecord(
      prisma,
      id,
      parsed.data,
      { id: session!.user.id },
      existing,
    );

    // After the write has committed; never throws.
    if (knoxRelevant) {
      await triggerTriage(
        { subjectType: "complaint", subjectId: id, serviceId: existing.serviceId, reason: "updated" },
        { immediate: true },
      );
    }

    return NextResponse.json({
      complaint: {
        id: updated.id,
        reference: updated.reference,
        status: updated.status,
        notificationDueAt: updated.notificationDueAt,
        regulatorNotifiedAt: updated.regulatorNotifiedAt,
        clock: clockStatus(updated.notificationDueAt, updated.regulatorNotifiedAt),
      },
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
