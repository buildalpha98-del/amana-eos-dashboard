import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { createRiskAssessmentSchema } from "@/lib/schemas/risk-assessment";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

function ensureServiceAccess(
  role: string,
  userServiceId: string | null | undefined,
  serviceId: string,
) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

// GET /api/services/[id]/risk-assessments?activityType=&status=
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const url = new URL(req.url);
  const activityType = url.searchParams.get("activityType") ?? undefined;
  const status = url.searchParams.get("status") ?? undefined; // "pending" | "approved"

  const items = await prisma.riskAssessment.findMany({
    where: {
      serviceId: id,
      ...(activityType ? { activityType } : {}),
      ...(status === "approved" ? { approvedAt: { not: null } } : {}),
      ...(status === "pending" ? { approvedAt: null } : {}),
    },
    orderBy: { date: "desc" },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      approvedBy: { select: { id: true, name: true, avatar: true } },
    },
  });

  return NextResponse.json({ items });
});

// POST /api/services/[id]/risk-assessments
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    ensureServiceAccess(session.user.role, session.user.serviceId, id);

    const body = await parseJsonBody(req);
    const parsed = createRiskAssessmentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const created = await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!service) throw ApiError.notFound("Service not found");

      const ra = await tx.riskAssessment.create({
        data: {
          serviceId: id,
          authorId: session.user.id,
          title: data.title,
          activityType: data.activityType,
          date: new Date(data.date),
          location: data.location ?? null,
          hazards: data.hazards,
          attachmentUrls: data.attachmentUrls ?? [],
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "created_risk_assessment",
          entityType: "RiskAssessment",
          entityId: ra.id,
          details: {
            serviceId: id,
            activityType: ra.activityType,
            date: ra.date.toISOString(),
            hazardCount: data.hazards.length,
          },
        },
      });

      return ra;
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "coordinator", "member"] },
);
