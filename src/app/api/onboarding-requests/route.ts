import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { EmploymentType, AwardLevel, QualificationType, NewStarterRequestStatus } from "@prisma/client";
import { notifyNewStarterRequestSubmitted } from "@/lib/new-starter-request/notify";

/**
 * Onboarding requests — the Team tab's leadership-only "Onboarding"
 * sub-tab. A state manager (head_office), admin, or owner flags a known
 * new hire so admin can complete the actual account creation + induction
 * pack. Restricted end to end (list AND create) to admin-tier roles —
 * this is not a general staff-facing form.
 */

const requestInclude = {
  requestedBy: { select: { id: true, name: true, email: true, avatar: true } },
  assignedAdmin: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  completedUser: { select: { id: true, name: true } },
  service: { select: { id: true, name: true } },
} as const;

// ---------------------------------------------------------------------------
// GET — list. Admin-tier only.
// ---------------------------------------------------------------------------

const listQuerySchema = z.object({
  status: z.nativeEnum(NewStarterRequestStatus).optional(),
});

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid query", parsed.error.flatten());
    }
    const where: Record<string, unknown> = {};
    if (parsed.data.status) where.status = parsed.data.status;

    const requests = await prisma.newStarterRequest.findMany({
      where,
      include: requestInclude,
      orderBy: [{ status: "asc" }, { expectedStartDate: "asc" }, { createdAt: "desc" }],
    });
    return NextResponse.json({ requests });
  },
  { roles: ["owner", "head_office", "admin"] },
);

// ---------------------------------------------------------------------------
// POST — create. Admin-tier only (state manager / admin / owner).
// ---------------------------------------------------------------------------

const createBodySchema = z.object({
  fullName: z.string().min(1).max(200),
  dateOfBirth: z.coerce.date(),
  address: z.string().min(1).max(500),
  targetPosition: z.string().min(1).max(200),
  employmentType: z.nativeEnum(EmploymentType),
  awardLevel: z.nativeEnum(AwardLevel),
  awardLevelCustom: z.string().max(100).optional(),
  qualification: z.nativeEnum(QualificationType).optional().nullable(),
  serviceId: z.string().min(1),
  expectedStartDate: z.coerce.date(),
  notes: z.string().max(5000).optional(),
});

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid request payload", parsed.error.flatten());
    }
    const data = parsed.data;

    if (data.awardLevel === "custom" && !data.awardLevelCustom?.trim()) {
      throw ApiError.badRequest("A custom award level label is required when award level is Custom");
    }

    const service = await prisma.service.findUnique({
      where: { id: data.serviceId },
      select: { id: true },
    });
    if (!service) throw ApiError.badRequest("Service not found");

    const created = await prisma.newStarterRequest.create({
      data: {
        fullName: data.fullName,
        dateOfBirth: data.dateOfBirth,
        address: data.address,
        targetPosition: data.targetPosition,
        employmentType: data.employmentType,
        awardLevel: data.awardLevel,
        awardLevelCustom: data.awardLevel === "custom" ? data.awardLevelCustom ?? null : null,
        qualification: data.qualification ?? null,
        serviceId: data.serviceId,
        expectedStartDate: data.expectedStartDate,
        notes: data.notes ?? null,
        requestedById: session.user.id,
      },
      include: requestInclude,
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "create",
        entityType: "NewStarterRequest",
        entityId: created.id,
        details: { fullName: created.fullName, serviceId: created.serviceId },
      },
    });

    await notifyNewStarterRequestSubmitted(prisma, {
      id: created.id,
      fullName: created.fullName,
      requestedById: created.requestedById,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
