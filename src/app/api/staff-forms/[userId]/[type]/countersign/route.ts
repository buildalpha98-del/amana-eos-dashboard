/**
 * POST /api/staff-forms/[userId]/responsible_person/countersign — the
 * nominated supervisor (the person's centre coordinator or a State Manager)
 * accepts a submitted Responsible Person form: ticks the documents they
 * viewed and signs on screen.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { canCountersignStaffForm, countersignSchema, formStatus } from "@/lib/staff-forms";

export const POST = withApiAuth(async (req, session, context) => {
  const { userId, type } = await context!.params!;
  if (type !== "responsible_person") throw ApiError.badRequest("Only the Responsible Person form is countersigned");
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, serviceId: true } });
  if (!target) throw ApiError.notFound("Staff member not found");
  const viewer = { id: session!.user.id, role: session!.user.role ?? null };
  if (!(await canCountersignStaffForm(viewer, target)))
    throw ApiError.forbidden("Only their centre's coordinator or a State Manager can sign as nominated supervisor");

  const parsed = countersignSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

  const now = new Date();
  // Only a submitted form, and only the version they're looking at being submitted.
  const claim = await prisma.staffForm.updateMany({
    where: { userId, type: "responsible_person", submittedAt: { not: null } },
    data: {
      supervisorSignatureDataUrl: parsed.data.signature,
      supervisorSignedById: viewer.id,
      supervisorName: session!.user.name || "Nominated supervisor",
      supervisorSignedAt: now,
      documentsViewed: parsed.data.documentsViewed,
    },
  });
  if (claim.count === 0) throw new ApiError(409, "The form hasn't been submitted yet");
  const form = await prisma.staffForm.findUnique({ where: { userId_type: { userId, type: "responsible_person" } } });
  await prisma.activityLog.create({
    data: {
      userId: viewer.id,
      action: "staff_form_countersigned",
      entityType: "StaffForm",
      entityId: form?.id ?? userId,
      details: { type, staffId: userId, documentsViewed: parsed.data.documentsViewed },
    },
  });
  return NextResponse.json({ status: form ? formStatus(form) : "complete", supervisorSignedAt: now });
});
