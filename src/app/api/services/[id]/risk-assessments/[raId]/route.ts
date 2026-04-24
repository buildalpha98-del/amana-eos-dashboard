import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { updateRiskAssessmentSchema } from "@/lib/schemas/risk-assessment";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);
const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

function ensureServiceAccess(
  role: string,
  userServiceId: string | null | undefined,
  serviceId: string,
) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

type RouteCtx = { params: Promise<{ id: string; raId: string }> };

async function loadAssessment(id: string, raId: string) {
  const ra = await prisma.riskAssessment.findUnique({
    where: { id: raId },
    select: { id: true, serviceId: true, authorId: true, approvedAt: true },
  });
  if (!ra || ra.serviceId !== id) {
    throw ApiError.notFound("Risk assessment not found");
  }
  return ra;
}

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, raId } = await (context as unknown as RouteCtx).params;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const ra = await loadAssessment(id, raId);
  if (ra.authorId !== session.user.id && !ADMIN_ROLES.has(session.user.role)) {
    throw ApiError.forbidden(
      "Only the author or an admin can edit this risk assessment",
    );
  }
  if (ra.approvedAt) {
    throw ApiError.badRequest(
      "Approved risk assessments are locked. Create a new one if you need changes.",
    );
  }

  const body = await parseJsonBody(req);
  const parsed = updateRiskAssessmentSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  const updated = await prisma.riskAssessment.update({
    where: { id: raId },
    data: {
      ...(patch.title ? { title: patch.title } : {}),
      ...(patch.activityType ? { activityType: patch.activityType } : {}),
      ...(patch.date ? { date: new Date(patch.date) } : {}),
      ...("location" in patch ? { location: patch.location ?? null } : {}),
      ...(patch.hazards ? { hazards: patch.hazards } : {}),
      ...(patch.attachmentUrls
        ? { attachmentUrls: patch.attachmentUrls }
        : {}),
    },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      approvedBy: { select: { id: true, name: true, avatar: true } },
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id, raId } = await (context as unknown as RouteCtx).params;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const ra = await loadAssessment(id, raId);
  if (ra.authorId !== session.user.id && !ADMIN_ROLES.has(session.user.role)) {
    throw ApiError.forbidden(
      "Only the author or an admin can delete this risk assessment",
    );
  }
  if (ra.approvedAt) {
    throw ApiError.badRequest("Approved risk assessments cannot be deleted.");
  }

  await prisma.riskAssessment.delete({ where: { id: raId } });
  return NextResponse.json({ ok: true });
});
