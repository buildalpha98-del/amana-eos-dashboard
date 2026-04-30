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

const createPdRecordSchema = z.object({
  title: z.string().min(1).max(200),
  type: z.enum(PD_TYPES),
  hours: z.number().positive().max(999.99),
  completedAt: z.string().refine((s) => !Number.isNaN(Date.parse(s)), {
    message: "completedAt must be a valid date",
  }),
  provider: z.string().max(200).nullable().optional(),
  attachmentUrl: z.string().url().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

/**
 * GET /api/users/[id]/pd-log
 * List PD records for a user. Admins see anyone's; users see their own.
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const role = session!.user.role ?? "";
  const viewerId = session!.user.id;

  if (!isAdminRole(role) && viewerId !== id) {
    throw ApiError.forbidden();
  }

  const records = await prisma.professionalDevelopmentRecord.findMany({
    where: { userId: id },
    orderBy: { completedAt: "desc" },
  });

  // Decimal → number for JSON
  return NextResponse.json(
    records.map((r) => ({ ...r, hours: Number(r.hours) })),
  );
});

/**
 * POST /api/users/[id]/pd-log
 * Create a PD record. Admin can create for anyone; staff can self-record.
 */
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const role = session!.user.role ?? "";
  const viewerId = session!.user.id;

  if (!isAdminRole(role) && viewerId !== id) {
    throw ApiError.forbidden();
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound("User not found");

  const body = await parseJsonBody(req);
  const parsed = createPdRecordSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Validation failed",
      parsed.error.flatten().fieldErrors,
    );
  }

  const record = await prisma.professionalDevelopmentRecord.create({
    data: {
      userId: id,
      title: parsed.data.title,
      type: parsed.data.type,
      hours: parsed.data.hours,
      completedAt: new Date(parsed.data.completedAt),
      provider: parsed.data.provider ?? null,
      attachmentUrl: parsed.data.attachmentUrl ?? null,
      notes: parsed.data.notes ?? null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: viewerId,
      action: "create",
      entityType: "ProfessionalDevelopmentRecord",
      entityId: record.id,
      details: {
        title: record.title,
        type: record.type,
        forUserId: id,
        selfRecord: viewerId === id,
      },
    },
  });

  return NextResponse.json({ ...record, hours: Number(record.hours) }, {
    status: 201,
  });
});
