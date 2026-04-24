import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { updateReflectionSchema } from "@/lib/schemas/staff-reflection";

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

type RouteCtx = { params: Promise<{ id: string; reflectionId: string }> };

async function loadReflection(id: string, reflectionId: string) {
  const ref = await prisma.staffReflection.findUnique({
    where: { id: reflectionId },
    select: { id: true, serviceId: true, authorId: true },
  });
  if (!ref || ref.serviceId !== id) {
    throw ApiError.notFound("Reflection not found");
  }
  return ref;
}

// PATCH /api/services/[id]/reflections/[reflectionId]
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id, reflectionId } = await (context as unknown as RouteCtx).params;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const ref = await loadReflection(id, reflectionId);
  // Only author or admin-up can edit.
  if (ref.authorId !== session.user.id && !ADMIN_ROLES.has(session.user.role)) {
    throw ApiError.forbidden("Only the author or an admin can edit this reflection");
  }

  const body = await parseJsonBody(req);
  const parsed = updateReflectionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten().fieldErrors,
      },
      { status: 400 },
    );
  }
  const patch = parsed.data;

  const updated = await prisma.staffReflection.update({
    where: { id: reflectionId },
    data: {
      ...(patch.type ? { type: patch.type } : {}),
      ...(patch.title ? { title: patch.title } : {}),
      ...(patch.content ? { content: patch.content } : {}),
      ...(patch.qualityAreas ? { qualityAreas: patch.qualityAreas } : {}),
      ...(patch.linkedObservationIds
        ? { linkedObservationIds: patch.linkedObservationIds }
        : {}),
      ...("mood" in patch ? { mood: patch.mood ?? null } : {}),
    },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
    },
  });

  return NextResponse.json(updated);
});

// DELETE /api/services/[id]/reflections/[reflectionId]
export const DELETE = withApiAuth(async (_req, session, context) => {
  const { id, reflectionId } = await (context as unknown as RouteCtx).params;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const ref = await loadReflection(id, reflectionId);
  if (ref.authorId !== session.user.id && !ADMIN_ROLES.has(session.user.role)) {
    throw ApiError.forbidden(
      "Only the author or an admin can delete this reflection",
    );
  }

  await prisma.staffReflection.delete({ where: { id: reflectionId } });
  return NextResponse.json({ ok: true });
});
