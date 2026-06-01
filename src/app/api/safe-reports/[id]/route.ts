/**
 * GET   /api/safe-reports/[id] — read a single report
 * PATCH /api/safe-reports/[id] — update status / reviewNotes
 *
 * Owner / head_office only — see route.ts for why admin is excluded.
 *
 * PATCH never lets the caller modify `content`, `category`, or
 * `serviceId` — the original report is immutable. Only the response
 * fields (status, review notes, resolvedAt) can change.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

const patchSchema = z.object({
  status: z
    .enum(["received", "under_review", "resolved", "closed_no_action"])
    .optional(),
  reviewNotes: z.string().max(20_000).nullable().optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

async function loadReport(id: string) {
  const r = await prisma.safeReport.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      reviewedBy: { select: { id: true, name: true } },
    },
  });
  if (!r || r.deleted) throw ApiError.notFound("Report not found");
  return r;
}

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const report = await loadReport(id);
    return NextResponse.json(report);
  },
  { roles: ["owner", "head_office"] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteContext).params;
    const existing = await loadReport(id);

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }

    const update: Record<string, unknown> = {};
    if (parsed.data.status !== undefined) {
      update.status = parsed.data.status;
      // Closure / resolved stamps the reviewer + timestamp. Re-opening
      // clears them (audit log preserves the prior closure history).
      const isClosing =
        parsed.data.status === "resolved" ||
        parsed.data.status === "closed_no_action";
      const wasClosed =
        existing.status === "resolved" ||
        existing.status === "closed_no_action";

      if (isClosing && !wasClosed) {
        update.resolvedAt = new Date();
        update.reviewedById = session!.user.id;
      } else if (!isClosing && wasClosed) {
        update.resolvedAt = null;
        // Keep reviewedById — it's still meaningful that this person
        // was the reviewer even after re-opening.
      } else if (existing.reviewedById === null) {
        // First touch by ANYONE — record the reviewer.
        update.reviewedById = session!.user.id;
      }
    }
    if (parsed.data.reviewNotes !== undefined) {
      update.reviewNotes = parsed.data.reviewNotes;
      if (existing.reviewedById === null) {
        update.reviewedById = session!.user.id;
      }
    }

    const updated = await prisma.safeReport.update({
      where: { id },
      data: update,
      include: {
        service: { select: { id: true, name: true, code: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    logger.info("Safe report updated", {
      reportId: id,
      actorId: session!.user.id,
      changedKeys: Object.keys(update),
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office"] },
);
