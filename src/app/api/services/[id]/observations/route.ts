import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { safeLimit } from "@/lib/pagination";
import { createObservationSchema } from "@/lib/schemas/learning-observation";

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

// GET /api/services/[id]/observations?childId=&mtop=&authorId=&cursor=&limit=
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const url = new URL(req.url);
  const childId = url.searchParams.get("childId") ?? undefined;
  const mtop = url.searchParams.get("mtop") ?? undefined;
  const authorId = url.searchParams.get("authorId") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = safeLimit(url.searchParams.get("limit"), 20, 50);

  const items = await prisma.learningObservation.findMany({
    where: {
      serviceId: id,
      ...(childId ? { childId } : {}),
      ...(mtop ? { mtopOutcomes: { has: mtop } } : {}),
      ...(authorId ? { authorId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      child: { select: { id: true, firstName: true, surname: true } },
    },
  });

  const hasMore = items.length > limit;
  const rows = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? rows[rows.length - 1]?.id : undefined;

  return NextResponse.json({ items: rows, nextCursor });
});

// POST /api/services/[id]/observations
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    ensureServiceAccess(session.user.role, session.user.serviceId, id);

    const body = await parseJsonBody(req);
    const parsed = createObservationSchema.safeParse(body);
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

    if (data.clientMutationId) {
      const existing = await prisma.learningObservation.findUnique({
        where: { clientMutationId: data.clientMutationId },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          child: { select: { id: true, firstName: true, surname: true } },
        },
      });
      if (existing) return NextResponse.json(existing, { status: 200 });
    }

    const created = await prisma.$transaction(async (tx) => {
      // Child must belong to this service.
      const child = await tx.child.findFirst({
        where: { id: data.childId, serviceId: id },
        select: { id: true },
      });
      if (!child) throw ApiError.badRequest("Child not found in this service");

      const obs = await tx.learningObservation.create({
        data: {
          childId: data.childId,
          serviceId: id,
          authorId: session.user.id,
          title: data.title,
          narrative: data.narrative,
          mtopOutcomes: data.mtopOutcomes ?? [],
          interests: data.interests ?? [],
          mediaUrls: data.mediaUrls ?? [],
          visibleToParent: data.visibleToParent ?? false,
          clientMutationId: data.clientMutationId ?? null,
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
          child: { select: { id: true, firstName: true, surname: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "created_observation",
          entityType: "LearningObservation",
          entityId: obs.id,
          details: {
            serviceId: id,
            childId: obs.childId,
            visibleToParent: obs.visibleToParent,
            mtopOutcomes: obs.mtopOutcomes,
          },
        },
      });

      return obs;
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "coordinator", "member", "staff"] },
);
