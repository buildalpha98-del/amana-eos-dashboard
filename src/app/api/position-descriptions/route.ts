/**
 * GET  /api/position-descriptions          — list (admin: all; others: published only)
 * GET  /api/position-descriptions?mine=1   — caller's own assigned PD (any role)
 * POST /api/position-descriptions          — create new PD (admin)
 *
 * Visibility:
 *   - admin / owner / head_office: see drafts + published + archived
 *   - everyone else: see published only (so they can browse for "what
 *     job descriptions exist here") + their own assigned PD via ?mine=1
 *   - ?status=published|draft|archived narrows the list
 *   - ?role=staff narrows by targetRole
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const STATUSES = ["draft", "published", "archived"] as const;
const ROLES: Role[] = [
  "owner",
  "head_office",
  "admin",
  "marketing",
  "member",
  "staff",
];

const createSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(20_000),
  responsibilities: z.string().min(1).max(20_000),
  selectionCriteria: z.string().min(1).max(20_000),
  qualifications: z.string().min(1).max(20_000),
  targetRole: z.enum(ROLES as [Role, ...Role[]]).nullable().optional(),
  status: z.enum(STATUSES).optional(),
});

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

export const GET = withApiAuth(async (req, session) => {
  const role = session!.user.role;
  const callerId = session!.user.id;
  const { searchParams } = new URL(req.url);
  const isAdmin = ADMIN_ROLES.has(role);

  // ?mine=1 — return the caller's currently assigned PD (or null).
  if (searchParams.get("mine") === "1") {
    const me = await prisma.user.findUnique({
      where: { id: callerId },
      select: {
        positionDescription: true,
        positionDescriptionAssignedAt: true,
      },
    });
    // Surface only if published or archived — a draft PD shouldn't be
    // visible to its assignee yet. (We don't normally assign drafts;
    // this is belt-and-braces.)
    const pd = me?.positionDescription;
    if (!pd || pd.status === "draft") {
      return NextResponse.json({ positionDescription: null });
    }
    return NextResponse.json({
      positionDescription: pd,
      assignedAt: me?.positionDescriptionAssignedAt,
    });
  }

  const statusParam = searchParams.get("status");
  const roleParam = searchParams.get("role");

  const where: Record<string, unknown> = {};
  if (statusParam && STATUSES.includes(statusParam as (typeof STATUSES)[number])) {
    where.status = statusParam;
  } else if (!isAdmin) {
    // Non-admins can only ever see published.
    where.status = "published";
  }
  if (roleParam && ROLES.includes(roleParam as Role)) {
    where.targetRole = roleParam;
  }

  const items = await prisma.positionDescription.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
      _count: { select: { assignedUsers: true } },
    },
    orderBy: [{ status: "asc" }, { title: "asc" }],
  });

  return NextResponse.json({ items });
});

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const data = parsed.data;
    const status = data.status ?? "draft";

    const created = await prisma.positionDescription.create({
      data: {
        title: data.title.trim(),
        summary: data.summary,
        responsibilities: data.responsibilities,
        selectionCriteria: data.selectionCriteria,
        qualifications: data.qualifications,
        targetRole: data.targetRole ?? null,
        status,
        publishedAt: status === "published" ? new Date() : null,
        createdById: session!.user.id,
      },
      include: {
        createdBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "position_description_created",
        entityType: "PositionDescription",
        entityId: created.id,
        details: {
          title: created.title,
          status: created.status,
          targetRole: created.targetRole,
        },
      },
    });

    logger.info("Position description created", {
      pdId: created.id,
      title: created.title,
      createdById: session!.user.id,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);
