import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { PayDiscrepancyStatus } from "@prisma/client";
import { isAdminRole } from "@/lib/role-permissions";
import { notifyPayDiscrepancySubmitted } from "@/lib/pay-discrepancy/notify";

/**
 * Pay discrepancy reports — My Portal form open to every staff role
 * ("my pay didn't match my hours"), reviewed by admin-tier.
 */

const reportInclude = {
  reporter: { select: { id: true, name: true, email: true, avatar: true } },
  reviewedBy: { select: { id: true, name: true } },
  service: { select: { id: true, name: true } },
} as const;

// ---------------------------------------------------------------------------
// GET — list. Admin-tier sees everyone's; everyone else is force-scoped
// to their own reports ("My reports").
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: z.nativeEnum(PayDiscrepancyStatus).optional(),
});

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const where: Record<string, unknown> = {};
  if (parsed.data.status) where.status = parsed.data.status;
  if (!isAdminRole(session.user.role)) {
    where.reporterId = session.user.id;
  }

  const reports = await prisma.payDiscrepancyReport.findMany({
    where,
    include: reportInclude,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return NextResponse.json({ reports });
});

// ---------------------------------------------------------------------------
// POST — create. Any authenticated dashboard role.
// ---------------------------------------------------------------------------

const createBodySchema = z.object({
  serviceId: z.string().optional().nullable(),
  discrepancyDate: z.coerce.date(),
  hoursShort: z.coerce.number().positive().max(500),
  description: z.string().max(5000).optional(),
});

export const POST = withApiAuth(async (req, session) => {
  const raw = await parseJsonBody(req);
  const parsed = createBodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid request payload", parsed.error.flatten());
  }
  const data = parsed.data;

  const created = await prisma.payDiscrepancyReport.create({
    data: {
      reporterId: session.user.id,
      serviceId: data.serviceId ?? null,
      discrepancyDate: data.discrepancyDate,
      hoursShort: data.hoursShort,
      description: data.description ?? null,
    },
    include: reportInclude,
  });

  await prisma.activityLog.create({
    data: {
      userId: session.user.id,
      action: "create",
      entityType: "PayDiscrepancyReport",
      entityId: created.id,
      details: { discrepancyDate: created.discrepancyDate, hoursShort: created.hoursShort },
    },
  });

  await notifyPayDiscrepancySubmitted(prisma, {
    id: created.id,
    reporterId: created.reporterId,
    reporterName: session.user.name ?? "A staff member",
  });

  return NextResponse.json(created, { status: 201 });
});
