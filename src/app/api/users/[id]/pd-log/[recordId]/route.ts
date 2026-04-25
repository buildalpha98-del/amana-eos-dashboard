import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";

const PD_TYPES = [
  "course",
  "workshop",
  "conference",
  "online",
  "mentoring",
  "reading",
  "other",
] as const;

const updatePdRecordSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  type: z.enum(PD_TYPES).optional(),
  hours: z.number().positive().max(999.99).optional(),
  completedAt: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), {
      message: "completedAt must be a valid date",
    })
    .optional(),
  provider: z.string().max(200).nullable().optional(),
  attachmentUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/** PATCH /api/users/[id]/pd-log/[recordId] — admin can edit anyone's; staff can edit own. */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, recordId } = await context!.params!;
  const role = session!.user.role ?? "";
  const viewerId = session!.user.id;

  if (!isAdminRole(role) && viewerId !== id) {
    throw ApiError.forbidden();
  }

  const existing = await prisma.professionalDevelopmentRecord.findUnique({
    where: { id: recordId },
  });
  if (!existing || existing.userId !== id) {
    throw ApiError.notFound("PD record not found");
  }

  const body = await parseJsonBody(req);
  const parsed = updatePdRecordSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { completedAt, ...rest } = parsed.data;
  const updated = await prisma.professionalDevelopmentRecord.update({
    where: { id: recordId },
    data: {
      ...rest,
      ...(completedAt !== undefined ? { completedAt: new Date(completedAt) } : {}),
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: viewerId,
      action: "update",
      entityType: "ProfessionalDevelopmentRecord",
      entityId: recordId,
      details: {
        changes: Object.keys(parsed.data),
        forUserId: id,
        selfEdit: viewerId === id,
      },
    },
  });

  return NextResponse.json({ ...updated, hours: Number(updated.hours) });
});

/** DELETE /api/users/[id]/pd-log/[recordId] — admin can delete anyone's; staff can delete own. */
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id, recordId } = await context!.params!;
  const role = session!.user.role ?? "";
  const viewerId = session!.user.id;

  if (!isAdminRole(role) && viewerId !== id) {
    throw ApiError.forbidden();
  }

  const existing = await prisma.professionalDevelopmentRecord.findUnique({
    where: { id: recordId },
  });
  if (!existing || existing.userId !== id) {
    throw ApiError.notFound("PD record not found");
  }

  await prisma.professionalDevelopmentRecord.delete({
    where: { id: recordId },
  });

  await prisma.activityLog.create({
    data: {
      userId: viewerId,
      action: "delete",
      entityType: "ProfessionalDevelopmentRecord",
      entityId: recordId,
      details: {
        title: existing.title,
        forUserId: id,
        selfDelete: viewerId === id,
      },
    },
  });

  return NextResponse.json({ ok: true });
});
