/**
 * PUT /api/staff-forms/[userId]/[type] — the staff member saves their own
 * form: a draft (any answers, no checks) or, with `submit` + a signature,
 * the finished form (fully validated). Re-submitting clears any supervisor
 * countersignature, because what they signed has changed.
 */
import { NextResponse } from "next/server";
import { Prisma, type StaffFormType } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { STAFF_FORM_TYPES, formStatus, formsFor, saveFormSchema, submitSchemaFor } from "@/lib/staff-forms";

export const PUT = withApiAuth(async (req, session, context) => {
  const { userId, type: rawType } = await context!.params!;
  if (!(STAFF_FORM_TYPES as readonly string[]).includes(rawType)) throw ApiError.notFound("Unknown form");
  const type = rawType as StaffFormType;
  if (session!.user.id !== userId) throw ApiError.forbidden("Only the staff member can fill in their own form");

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { positions: true, serviceId: true } });
  if (!user) throw ApiError.notFound("Staff member not found");
  if (!formsFor(user.positions).includes(type)) throw ApiError.forbidden("This form isn't needed for your position");

  const parsed = saveFormSchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
  const { data, submit, signature } = parsed.data;

  let stored: Prisma.InputJsonValue = data as Prisma.InputJsonValue;
  const now = new Date();
  let submitFields: {
    staffSignatureDataUrl: string;
    submittedAt: Date;
    serviceId: string | null;
    supervisorSignatureDataUrl: null;
    supervisorSignedById: null;
    supervisorName: null;
    supervisorSignedAt: null;
  } | null = null;
  if (submit) {
    const checked = submitSchemaFor(type).safeParse(data);
    if (!checked.success) throw ApiError.badRequest(checked.error.issues[0].message, checked.error.flatten());
    if (!signature) throw ApiError.badRequest("Sign in the box to submit");
    stored = checked.data as Prisma.InputJsonValue;
    submitFields = {
      staffSignatureDataUrl: signature,
      submittedAt: now,
      serviceId: user.serviceId,
      supervisorSignatureDataUrl: null,
      supervisorSignedById: null,
      supervisorName: null,
      supervisorSignedAt: null,
    };
  }

  const form = await prisma.staffForm.upsert({
    where: { userId_type: { userId, type } },
    create: { userId, type, data: stored, ...(submitFields ?? {}) },
    update: { data: stored, ...(submitFields ?? {}) },
  });
  if (submit) {
    await prisma.activityLog.create({
      data: { userId, action: "staff_form_submitted", entityType: "StaffForm", entityId: form.id, details: { type } },
    });
  }
  return NextResponse.json({ status: formStatus(form), submittedAt: form.submittedAt, updatedAt: form.updatedAt });
});
