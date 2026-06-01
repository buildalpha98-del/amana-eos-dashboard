/**
 * GET    /api/position-descriptions/[id] — single PD with assigned users
 * PATCH  /api/position-descriptions/[id] — update fields + status
 * DELETE /api/position-descriptions/[id] — archive (status=archived).
 *
 * Visibility:
 *   - admin / owner / head_office: read any status; full mutation
 *   - everyone else: read published PDs only
 *
 * Status transitions are explicit — PATCH `status: "published"` sets
 * publishedAt to now (if not already set); status: "archived" sets
 * archivedAt. Re-publishing a previously-archived PD clears
 * archivedAt and stamps publishedAt fresh.
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

const patchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  summary: z.string().min(1).max(20_000).optional(),
  responsibilities: z.string().min(1).max(20_000).optional(),
  selectionCriteria: z.string().min(1).max(20_000).optional(),
  qualifications: z.string().min(1).max(20_000).optional(),
  targetRole: z.enum(ROLES as [Role, ...Role[]]).nullable().optional(),
  status: z.enum(STATUSES).optional(),
});

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as RouteContext).params;
  const role = session!.user.role;
  const isAdmin = ADMIN_ROLES.has(role);

  const pd = await prisma.positionDescription.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, name: true } },
      assignedUsers: {
        select: { id: true, name: true, role: true, active: true },
      },
    },
  });
  if (!pd) throw ApiError.notFound("Position description not found");

  // Non-admins only see published PDs.
  if (!isAdmin && pd.status !== "published") throw ApiError.forbidden();

  return NextResponse.json(pd);
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.positionDescription.findUnique({
      where: { id },
    });
    if (!existing) throw ApiError.notFound("Position description not found");

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const p = parsed.data;

    const update: Record<string, unknown> = {};
    if (p.title !== undefined) update.title = p.title.trim();
    if (p.summary !== undefined) update.summary = p.summary;
    if (p.responsibilities !== undefined)
      update.responsibilities = p.responsibilities;
    if (p.selectionCriteria !== undefined)
      update.selectionCriteria = p.selectionCriteria;
    if (p.qualifications !== undefined)
      update.qualifications = p.qualifications;
    if (p.targetRole !== undefined) update.targetRole = p.targetRole;

    if (p.status !== undefined) {
      update.status = p.status;
      if (p.status === "published") {
        // First-time publish OR re-publish from archived: stamp fresh.
        if (existing.status !== "published") update.publishedAt = new Date();
        // Clear archive stamp if we're reviving.
        if (existing.status === "archived") update.archivedAt = null;
      } else if (p.status === "archived") {
        update.archivedAt = new Date();
      } else if (p.status === "draft") {
        // Reverting to draft from a published PD is allowed (admin
        // editing actively-published content). We DON'T strip
        // publishedAt — historic published date is preserved.
      }
    }

    const updated = await prisma.positionDescription.update({
      where: { id },
      data: update,
      include: {
        createdBy: { select: { id: true, name: true } },
        assignedUsers: {
          select: { id: true, name: true, role: true, active: true },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "position_description_updated",
        entityType: "PositionDescription",
        entityId: id,
        details: JSON.parse(
          JSON.stringify({
            changedKeys: Object.keys(update),
            previousStatus: existing.status,
          }),
        ),
      },
    });

    logger.info("Position description updated", {
      pdId: id,
      changedKeys: Object.keys(update),
      actorId: session!.user.id,
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await prisma.positionDescription.findUnique({
      where: { id },
      include: { _count: { select: { assignedUsers: true } } },
    });
    if (!existing) throw ApiError.notFound("Position description not found");

    // Refuse hard delete when users are still attached — admin must
    // re-assign or remove first. Archive is the soft-delete path.
    if (existing._count.assignedUsers > 0) {
      throw ApiError.badRequest(
        `Cannot delete — ${existing._count.assignedUsers} user(s) are still assigned to this PD. Unassign them or archive instead.`,
      );
    }

    await prisma.positionDescription.delete({ where: { id } });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "position_description_deleted",
        entityType: "PositionDescription",
        entityId: id,
        details: { title: existing.title },
      },
    });

    logger.warn("Position description deleted", {
      pdId: id,
      title: existing.title,
      actorId: session!.user.id,
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner"] },
);
