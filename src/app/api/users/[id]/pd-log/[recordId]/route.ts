import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

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

/** PATCH /api/users/[id]/pd-log/[recordId] — admin-only */
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id, recordId } = await context!.params!;

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
        userId: session!.user.id,
        action: "update",
        entityType: "ProfessionalDevelopmentRecord",
        entityId: recordId,
        details: { changes: Object.keys(parsed.data), forUserId: id },
      },
    });

    return NextResponse.json({ ...updated, hours: Number(updated.hours) });
  },
  { roles: ["owner", "head_office", "admin"] },
);

/** DELETE /api/users/[id]/pd-log/[recordId] — admin-only */
export const DELETE = withApiAuth(
  async (req, session, context) => {
    const { id, recordId } = await context!.params!;

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
        userId: session!.user.id,
        action: "delete",
        entityType: "ProfessionalDevelopmentRecord",
        entityId: recordId,
        details: { title: existing.title, forUserId: id },
      },
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin"] },
);
