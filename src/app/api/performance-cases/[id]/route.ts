/**
 * GET    /api/performance-cases/[id] — single case
 * PATCH  /api/performance-cases/[id] — update (status, outcome, follow-up, etc)
 * DELETE /api/performance-cases/[id] — soft-delete (owner only)
 *
 * Same visibility rules as the list endpoint:
 *   - confidential → owner only
 *   - everyone else (non-confidential) → owner / head_office / admin
 *
 * Updates that *close* a case (status → resolved | closed) auto-fill
 * `closedAt` and `closedById` so closure is always attributable.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "escalated",
  "closed",
] as const;

const patchSchema = z.object({
  status: z.enum(STATUSES).optional(),
  title: z.string().min(1).max(200).optional(),
  summary: z.string().min(1).max(20_000).optional(),
  followUpAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  outcome: z.string().max(20_000).nullable().optional(),
  fileUrl: z.string().url().nullable().optional(),
  fileName: z.string().max(255).nullable().optional(),
  confidential: z.boolean().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function loadCase(id: string, role: string) {
  const c = await prisma.performanceCase.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, name: true } },
      raisedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });
  if (!c || c.deleted) throw ApiError.notFound("Performance case not found");
  if (c.confidential && role !== "owner") throw ApiError.forbidden();
  return c;
}

export const GET = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const c = await loadCase(id, session!.user.role);
    return NextResponse.json(c);
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await loadCase(id, session!.user.role);

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const p = parsed.data;

    // Build the update payload — only include fields that were actually
    // sent (zod's `.optional()` keeps the type explicit). Closing a case
    // auto-stamps closedAt + closedById so it's always attributable.
    const update: Record<string, unknown> = {};
    if (p.status !== undefined) update.status = p.status;
    if (p.title !== undefined) update.title = p.title.trim();
    if (p.summary !== undefined) update.summary = p.summary.trim();
    if (p.followUpAt !== undefined) {
      update.followUpAt = p.followUpAt ? new Date(p.followUpAt) : null;
    }
    if (p.outcome !== undefined) update.outcome = p.outcome;
    if (p.fileUrl !== undefined) update.fileUrl = p.fileUrl;
    if (p.fileName !== undefined) update.fileName = p.fileName;
    if (p.confidential !== undefined) update.confidential = p.confidential;

    const justClosed =
      (p.status === "resolved" || p.status === "closed") &&
      existing.status !== "resolved" &&
      existing.status !== "closed";
    if (justClosed) {
      update.closedAt = new Date();
      update.closedById = session!.user.id;
    }
    // Re-opening (status moving back out of resolved/closed) clears the
    // closure stamps. Audit log preserves the prior closure history.
    const justReopened =
      p.status !== undefined &&
      p.status !== "resolved" &&
      p.status !== "closed" &&
      (existing.status === "resolved" || existing.status === "closed");
    if (justReopened) {
      update.closedAt = null;
      update.closedById = null;
    }

    const updated = await prisma.performanceCase.update({
      where: { id },
      data: update,
      include: {
        user: { select: { id: true, name: true } },
        raisedBy: { select: { id: true, name: true } },
        closedBy: { select: { id: true, name: true } },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "performance_case_updated",
        entityType: "PerformanceCase",
        entityId: id,
        // `update` is typed Record<string, unknown> which Prisma's JSON
        // column rejects (it wants concrete InputJsonValue). Round-trip
        // through JSON so the runtime value is plain JSON-serialisable.
        // Same pattern used in cron-guard's `complete(details)` path.
        details: JSON.parse(JSON.stringify({
          changes: update,
          subjectUserId: existing.userId,
          previousStatus: existing.status,
        })),
      },
    });

    logger.info("Performance case updated", {
      caseId: id,
      actorId: session!.user.id,
      changedKeys: Object.keys(update),
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const c = await loadCase(id, session!.user.role);

    // Owner only. Soft delete (deleted=true). Rows physically survive
    // for the 7-year Fair Work retention window.
    await prisma.performanceCase.update({
      where: { id },
      data: { deleted: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "performance_case_deleted",
        entityType: "PerformanceCase",
        entityId: id,
        details: {
          subjectUserId: c.userId,
          type: c.type,
          confidential: c.confidential,
        },
      },
    });

    logger.warn("Performance case soft-deleted", {
      caseId: id,
      actorId: session!.user.id,
      subjectUserId: c.userId,
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner"] },
);
