/**
 * GET /api/staff-forms/[userId] — a staff member's compliance forms (Staff
 * Record, and the Responsible Person form if they hold that position), with
 * what the viewer may do. Visible to the same people as their certificates.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import {
  RP_DOCUMENTS,
  STAFF_FORM_TITLES,
  canCountersignStaffForm,
  canViewStaffForms,
  formStatus,
  formsFor,
  staffFormPrefill,
} from "@/lib/staff-forms";

export const GET = withApiAuth(async (_req, session, context) => {
  const { userId } = await context!.params!;
  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, serviceId: true, positions: true, service: { select: { name: true } } },
  });
  if (!target) throw ApiError.notFound("Staff member not found");
  const viewer = { id: session!.user.id, role: session!.user.role ?? null };
  if (!(await canViewStaffForms(viewer, target))) throw ApiError.forbidden();

  const types = formsFor(target.positions);
  const [rows, prefill, canCountersign] = await Promise.all([
    prisma.staffForm.findMany({ where: { userId, type: { in: types } } }),
    staffFormPrefill(userId),
    canCountersignStaffForm(viewer, target),
  ]);
  const isSelf = viewer.id === target.id;

  return NextResponse.json({
    staff: { id: target.id, name: target.name, centreName: target.service?.name ?? null },
    canEdit: isSelf,
    canCountersign,
    documents: RP_DOCUMENTS,
    forms: types.map((type) => {
      const f = rows.find((r) => r.type === type) ?? null;
      const saved = (f?.data ?? {}) as Record<string, unknown>;
      return {
        type,
        title: STAFF_FORM_TITLES[type],
        status: formStatus(f),
        // Saved answers win; anything not answered yet starts from what we hold.
        data: { ...prefill, ...saved },
        staffSignatureDataUrl: f?.staffSignatureDataUrl ?? null,
        submittedAt: f?.submittedAt ?? null,
        supervisorName: f?.supervisorName ?? null,
        supervisorSignatureDataUrl: f?.supervisorSignatureDataUrl ?? null,
        supervisorSignedAt: f?.supervisorSignedAt ?? null,
        documentsViewed: f?.documentsViewed ?? [],
        updatedAt: f?.updatedAt ?? null,
      };
    }),
  });
});
