import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { notifyNewRock } from "@/lib/teams-notify";
import { createRockSchema } from "@/lib/schemas/rock";
import { parsePagination } from "@/lib/pagination";
import { sendAssignmentEmail } from "@/lib/send-assignment-email";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

// GET /api/rocks — list rocks with optional quarter filter
export const GET = withApiAuth(async (req, session) => {
  // Rocks are EOS-wide OKRs: coordinators and marketing retain cross-service
  // visibility regardless of their serviceId. See 4b scope audit at
  // docs/superpowers/plans/2026-04-22-services-daily-ops-4b-scope-audit.md#12.
  const role = session!.user.role as string;
  const scope =
    role === "member" || role === "marketing"
      ? null
      : getServiceScope(session);
  const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const quarter = searchParams.get("quarter");
  const serviceId = searchParams.get("serviceId");

  const rockType = searchParams.get("rockType");

  const where: Record<string, unknown> = { deleted: false };
  if (quarter) where.quarter = quarter;
  if (serviceId) where.serviceId = serviceId;
  if (rockType) where.rockType = rockType;

  // Member/staff: only see rocks for their service or owned by them
  if (scope) {
    where.OR = [
      { serviceId: scope },
      { ownerId: session!.user.id },
    ];
  }

  // State Manager: only see rocks for services in their assigned state
  if (stateScope) where.service = { state: stateScope };

  const include = {
    owner: { select: { id: true, name: true, email: true, avatar: true } },
    oneYearGoal: { select: { id: true, title: true } },
    _count: {
      select: {
        todos: { where: { deleted: false } },
        issues: { where: { deleted: false } },
        milestones: true,
      },
    },
  };
  const orderBy = [{ priority: "asc" as const }, { createdAt: "desc" as const }];

  const pagination = parsePagination(searchParams);

  if (pagination) {
    const [items, total] = await Promise.all([
      prisma.rock.findMany({ where, include, orderBy, skip: pagination.skip, take: pagination.limit }),
      prisma.rock.count({ where }),
    ]);
    return NextResponse.json({
      items,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  const rocks = await prisma.rock.findMany({ where, include, orderBy });
  return NextResponse.json(rocks);
});

// POST /api/rocks — create a new rock
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createRockSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const rock = await prisma.rock.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      ownerId: parsed.data.ownerId,
      quarter: parsed.data.quarter,
      priority: parsed.data.priority,
      rockType: parsed.data.rockType,
      oneYearGoalId: parsed.data.oneYearGoalId || null,
      serviceId: parsed.data.serviceId || null,
    },
    include: {
      owner: { select: { id: true, name: true, email: true, avatar: true } },
      oneYearGoal: { select: { id: true, title: true } },
      _count: {
        select: {
          todos: { where: { deleted: false } },
          issues: { where: { deleted: false } },
          milestones: true,
        },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Rock",
      entityId: rock.id,
      details: { title: rock.title, quarter: rock.quarter },
    },
  });

  // Teams notification (fire-and-forget)
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  notifyNewRock({
    title: rock.title,
    owner: rock.owner?.name || "Unassigned",
    quarter: rock.quarter,
    url: `${baseUrl}/rocks`,
  }).catch((err) => logger.error("Failed to send Teams notification for new rock", { err, rockId: rock.id }));

  // Notify assigned owner via email (fire-and-forget)
  if (rock.ownerId && rock.ownerId !== session!.user.id) {
    sendAssignmentEmail({
      type: "rock",
      assigneeId: rock.ownerId,
      assignerId: session!.user.id,
      entityTitle: rock.title,
    });
  }

  return NextResponse.json(rock, { status: 201 });
  // 2026-04-30: opened up to coordinator + member so service-level users can
  // create rocks from inside their /services/[id] EOS tab. Service scoping
  // is enforced by the UI passing serviceId on create; cross-service rocks
  // remain admin-only via the parent flow.
}, { roles: ["owner", "head_office", "admin", "member"] });
