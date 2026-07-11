import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { safeLimit } from "@/lib/pagination";
import { createReflectionSchema } from "@/lib/schemas/staff-reflection";
import { notifyParentNewPost } from "@/lib/parent-notifications";
import { logger } from "@/lib/logger";

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

// GET /api/services/[id]/reflections?type=&qa=&authorId=&from=&to=&cursor=&limit=
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const url = new URL(req.url);
  const type = url.searchParams.get("type") ?? undefined;
  const qaParam = url.searchParams.get("qa");
  const qa = qaParam ? Number(qaParam) : undefined;
  const authorId = url.searchParams.get("authorId") ?? undefined;
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = safeLimit(url.searchParams.get("limit"), 20, 50);

  const fromParam = url.searchParams.get("from");
  const toParam = url.searchParams.get("to");
  const from = fromParam ? new Date(fromParam) : undefined;
  const to = toParam ? new Date(toParam) : undefined;
  if ((from && isNaN(from.getTime())) || (to && isNaN(to.getTime()))) {
    throw ApiError.badRequest("from/to must be valid dates");
  }

  const items = await prisma.staffReflection.findMany({
    where: {
      serviceId: id,
      ...(type ? { type } : {}),
      ...(authorId ? { authorId } : {}),
      ...(qa && qa >= 1 && qa <= 7 ? { qualityAreas: { has: qa } } : {}),
      ...(from || to
        ? {
            createdAt: {
              ...(from ? { gte: from } : {}),
              ...(to ? { lte: to } : {}),
            },
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      author: { select: { id: true, name: true, avatar: true } },
    },
  });

  const hasMore = items.length > limit;
  const rows = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore ? rows[rows.length - 1]?.id : undefined;

  return NextResponse.json({ items: rows, nextCursor });
});

// POST /api/services/[id]/reflections
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    ensureServiceAccess(session.user.role, session.user.serviceId, id);

    const body = await parseJsonBody(req);
    const parsed = createReflectionSchema.safeParse(body);
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

    // Offline-queue dedupe: if a clientMutationId is supplied and we've seen
    // it before, return the existing row rather than creating a duplicate.
    if (data.clientMutationId) {
      const existing = await prisma.staffReflection.findUnique({
        where: { clientMutationId: data.clientMutationId },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });
      if (existing) return NextResponse.json(existing, { status: 200 });
    }

    const created = await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!service) throw ApiError.notFound("Service not found");

      const reflection = await tx.staffReflection.create({
        data: {
          serviceId: id,
          authorId: session.user.id,
          type: data.type,
          title: data.title,
          content: data.content,
          qualityAreas: data.qualityAreas ?? [],
          linkedObservationIds: data.linkedObservationIds ?? [],
          mood: data.mood ?? null,
          mtopOutcomes: data.mtopOutcomes ?? [],
          clientMutationId: data.clientMutationId ?? null,
        },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "created_reflection",
          entityType: "StaffReflection",
          entityId: reflection.id,
          details: {
            serviceId: id,
            type: reflection.type,
            mood: reflection.mood,
          },
        },
      });

      // Daily reflections fan out: one LearningObservation per tagged child,
      // plus a ParentPost when shared with parents. Same transaction — no
      // partial fan-out states.
      if (data.type !== "daily") return { reflection, fanOutChildIds: [] };

      const childIds = data.childIds ?? [];
      const observationIds: string[] = [];
      let parentPostId: string | null = null;

      if (childIds.length > 0) {
        const valid = await tx.child.findMany({
          where: { id: { in: childIds }, serviceId: id },
          select: { id: true },
        });
        if (valid.length !== childIds.length) {
          throw ApiError.badRequest(
            "One or more tagged children do not belong to this service",
          );
        }
        // One round-trip for all children — sequential per-child creates blew
        // Prisma's 5s interactive-transaction timeout on high-latency links.
        const obs = await tx.learningObservation.createManyAndReturn({
          data: valid.map((child) => ({
            childId: child.id,
            serviceId: id,
            authorId: session.user.id,
            title: data.title,
            narrative: data.content,
            mtopOutcomes: data.mtopOutcomes ?? [],
            visibleToParent: data.shareWithParents === true,
            sourceReflectionId: reflection.id,
          })),
          select: { id: true },
        });
        observationIds.push(...obs.map((o) => o.id));
      }

      if (data.shareWithParents) {
        const post = await tx.parentPost.create({
          data: {
            serviceId: id,
            authorId: session.user.id,
            title: data.title,
            content: data.content,
            type: "observation",
            isCommunity: childIds.length === 0,
            tags:
              childIds.length > 0
                ? { create: childIds.map((childId) => ({ childId })) }
                : undefined,
          },
          select: { id: true },
        });
        parentPostId = post.id;
      }

      if (observationIds.length === 0 && !parentPostId) {
        return { reflection, fanOutChildIds: [] };
      }

      const updated = await tx.staffReflection.update({
        where: { id: reflection.id },
        data: { linkedObservationIds: observationIds, parentPostId },
        include: {
          author: { select: { id: true, name: true, avatar: true } },
        },
      });
      return {
        reflection: updated,
        fanOutChildIds: parentPostId ? childIds : [],
      };
      // 15s headroom: the fan-out is ~6 queries and the Prisma default (5s)
      // is too tight on high-latency DB links.
    }, { timeout: 15_000 });

    // Fire-and-forget: notify parents of tagged children about the new post.
    const { reflection, fanOutChildIds } = created;
    if (reflection.parentPostId && fanOutChildIds.length > 0) {
      notifyParentNewPost(
        reflection.parentPostId,
        data.title,
        "observation",
        fanOutChildIds,
      ).catch((err) =>
        logger.error("Reflection fan-out notification failed", {
          postId: reflection.parentPostId,
          err,
        }),
      );
    }

    return NextResponse.json(reflection, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
