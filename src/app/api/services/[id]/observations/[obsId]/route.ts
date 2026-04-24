import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { updateObservationSchema } from "@/lib/schemas/learning-observation";

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

type RouteCtx = { params: Promise<{ id: string; obsId: string }> };

async function loadObservation(id: string, obsId: string) {
  const obs = await prisma.learningObservation.findUnique({
    where: { id: obsId },
    select: { id: true, serviceId: true, authorId: true },
  });
  if (!obs || obs.serviceId !== id) {
    throw ApiError.notFound("Observation not found");
  }
  return obs;
}

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, obsId } = await (context as unknown as RouteCtx).params;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const obs = await loadObservation(id, obsId);
  if (obs.authorId !== session.user.id && !ADMIN_ROLES.has(session.user.role)) {
    throw ApiError.forbidden("Only the author or an admin can edit this observation");
  }

  const body = await parseJsonBody(req);
  const parsed = updateObservationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  const updated = await prisma.learningObservation.update({
    where: { id: obsId },
    data: {
      ...(patch.title ? { title: patch.title } : {}),
      ...(patch.narrative ? { narrative: patch.narrative } : {}),
      ...(patch.mtopOutcomes ? { mtopOutcomes: patch.mtopOutcomes } : {}),
      ...(patch.interests ? { interests: patch.interests } : {}),
      ...(patch.mediaUrls ? { mediaUrls: patch.mediaUrls } : {}),
      ...(typeof patch.visibleToParent === "boolean"
        ? { visibleToParent: patch.visibleToParent }
        : {}),
    },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      child: { select: { id: true, firstName: true, surname: true } },
    },
  });

  return NextResponse.json(updated);
});

export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id, obsId } = await (context as unknown as RouteCtx).params;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const obs = await loadObservation(id, obsId);
  if (obs.authorId !== session.user.id && !ADMIN_ROLES.has(session.user.role)) {
    throw ApiError.forbidden("Only the author or an admin can delete this observation");
  }

  await prisma.learningObservation.delete({ where: { id: obsId } });
  return NextResponse.json({ ok: true });
});
