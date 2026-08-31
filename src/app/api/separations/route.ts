/**
 * GET   /api/separations?userId=X — fetch the separation record (if any)
 * POST  /api/separations              — create a new separation record
 * PATCH /api/separations?userId=X — update the existing record
 *
 * One separation per user (unique constraint at the DB layer). Re-hires
 * get a new User row, not a re-used SeparationRecord.
 *
 * Visibility: owner / head_office / admin. Staff do NOT have read
 * access to their own separation record through this surface —
 * separation facts (especially dismissal_misconduct) need to be
 * communicated through formal channels, not via a self-service portal.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import {
  isConfigured as isEhConfigured,
  terminateEmployee,
  EhPayrollError,
} from "@/lib/eh-payroll";

/**
 * Push the separation to Employment Hero. Fire-and-forget in spirit —
 * on failure we stamp the error onto the record and keep going. The
 * local Separation is authoritative; EH is a downstream mirror. Returns
 * whether the sync ran (for logging / response shaping).
 *
 * Skips silently when:
 *   - EH integration isn't configured (env vars not set)
 *   - The user has no employmentHeroEmployeeId (they were never
 *     imported into EH, or already cleared)
 * Both cases stamp `ehTerminationError` with a descriptive message so
 * the SeparationTab UI can render an amber "not linked" badge.
 */
async function syncTerminationToEH(recordId: string, userId: string, lastWorkingDay: string) {
  if (!isEhConfigured()) {
    await prisma.separationRecord.update({
      where: { id: recordId },
      data: {
        ehTerminationSyncedAt: null,
        ehTerminationError: "Employment Hero integration not configured",
      },
    });
    return { synced: false, reason: "not_configured" as const };
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { employmentHeroEmployeeId: true, name: true },
  });
  if (!user?.employmentHeroEmployeeId) {
    await prisma.separationRecord.update({
      where: { id: recordId },
      data: {
        ehTerminationSyncedAt: null,
        ehTerminationError:
          "Not linked to Employment Hero — no employmentHeroEmployeeId on user record. Terminate manually in EH.",
      },
    });
    return { synced: false, reason: "not_linked" as const };
  }
  try {
    await terminateEmployee(user.employmentHeroEmployeeId, {
      terminationDate: lastWorkingDay,
    });
    await prisma.separationRecord.update({
      where: { id: recordId },
      data: { ehTerminationSyncedAt: new Date(), ehTerminationError: null },
    });
    logger.info("Separation synced to Employment Hero", {
      recordId,
      userId,
      lastWorkingDay,
    });
    return { synced: true as const };
  } catch (err) {
    const msg =
      err instanceof EhPayrollError
        ? `EH ${err.status}: ${typeof err.body === "string" ? err.body : "rejected termination"}`
        : err instanceof Error
          ? err.message
          : "Unknown EH error";
    await prisma.separationRecord.update({
      where: { id: recordId },
      data: { ehTerminationSyncedAt: null, ehTerminationError: msg },
    });
    logger.warn("Separation → EH sync failed", {
      recordId,
      userId,
      error: msg,
    });
    return { synced: false, reason: "eh_error" as const, error: msg };
  }
}

const REASONS = [
  "resignation",
  "dismissal_capacity",
  "dismissal_misconduct",
  "redundancy",
  "end_of_contract",
  "mutual_separation",
  "retirement",
  "abandonment",
  "deceased",
  "other",
] as const;

const baseFieldsSchema = z.object({
  reason: z.enum(REASONS),
  reasonDetail: z.string().max(20_000).nullable().optional(),
  noticeStartDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  lastWorkingDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  noticePeriodWeeks: z.number().min(0).max(520).nullable().optional(), // 10y sanity cap
  finalPayProcessed: z.boolean().optional(),
  finalPayProcessedAt: z.string().datetime().nullable().optional(),
  finalPayNotes: z.string().max(20_000).nullable().optional(),
  referenceLetterIssued: z.boolean().optional(),
  referenceLetterUrl: z.string().url().nullable().optional(),
  referenceNotes: z.string().max(20_000).nullable().optional(),
  eligibleForRehire: z.boolean().optional(),
  rehireNotes: z.string().max(20_000).nullable().optional(),
  exitInterviewCompleted: z.boolean().optional(),
  exitInterviewNotes: z.string().max(20_000).nullable().optional(),
  exitInterviewAt: z.string().datetime().nullable().optional(),
  performanceCaseId: z.string().min(1).nullable().optional(),
});

const createSchema = baseFieldsSchema.extend({
  userId: z.string().min(1),
});

// PATCH: every field optional; userId comes from the query string.
const patchSchema = baseFieldsSchema.partial();

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) throw ApiError.badRequest("userId is required");

    const record = await prisma.separationRecord.findUnique({
      where: { userId },
      include: {
        recordedBy: { select: { id: true, name: true } },
        performanceCase: {
          select: { id: true, type: true, title: true, occurredAt: true },
        },
      },
    });
    if (!record || record.deleted) {
      return NextResponse.json({ record: null });
    }
    return NextResponse.json({ record });
  },
  { roles: ["owner", "head_office", "admin"] },
);

/**
 * Convert the various date-string inputs into the right Prisma shape.
 * `lastWorkingDay` + `noticeStartDate` are `@db.Date` so we hand them
 * a Date at midnight UTC. `finalPayProcessedAt` + `exitInterviewAt`
 * are full DateTime.
 */
function toDateOnly(s: string | null | undefined): Date | null | undefined {
  if (s === null) return null;
  if (s === undefined) return undefined;
  return new Date(`${s}T00:00:00.000Z`);
}
function toDateTime(s: string | null | undefined): Date | null | undefined {
  if (s === null) return null;
  if (s === undefined) return undefined;
  return new Date(s);
}

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

    // Dismissals require a non-empty reasonDetail. Anyone can resign
    // without a paragraph of justification, but a dismissal record
    // without context is a Fair Work-defendable gap.
    if (
      (data.reason === "dismissal_capacity" || data.reason === "dismissal_misconduct") &&
      (!data.reasonDetail || data.reasonDetail.trim().length < 20)
    ) {
      throw ApiError.badRequest(
        "Dismissal records must include reasonDetail explaining the basis (at least 20 characters).",
      );
    }

    // Confirm the user exists and doesn't already have a record.
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true },
    });
    if (!user) throw ApiError.notFound("User not found");

    const existing = await prisma.separationRecord.findUnique({
      where: { userId: data.userId },
      select: { id: true, deleted: true },
    });
    if (existing && !existing.deleted) {
      throw ApiError.conflict(
        `${user.name} already has a separation record. PATCH it instead, or soft-delete and recreate.`,
      );
    }

    const created = await prisma.separationRecord.create({
      data: {
        userId: data.userId,
        recordedById: session!.user.id,
        reason: data.reason,
        reasonDetail: data.reasonDetail ?? null,
        noticeStartDate: toDateOnly(data.noticeStartDate) ?? null,
        lastWorkingDay: toDateOnly(data.lastWorkingDay)!,
        noticePeriodWeeks: data.noticePeriodWeeks ?? null,
        finalPayProcessed: data.finalPayProcessed ?? false,
        finalPayProcessedAt: toDateTime(data.finalPayProcessedAt) ?? null,
        finalPayNotes: data.finalPayNotes ?? null,
        referenceLetterIssued: data.referenceLetterIssued ?? false,
        referenceLetterUrl: data.referenceLetterUrl ?? null,
        referenceNotes: data.referenceNotes ?? null,
        eligibleForRehire: data.eligibleForRehire ?? true,
        rehireNotes: data.rehireNotes ?? null,
        exitInterviewCompleted: data.exitInterviewCompleted ?? false,
        exitInterviewNotes: data.exitInterviewNotes ?? null,
        exitInterviewAt: toDateTime(data.exitInterviewAt) ?? null,
        performanceCaseId: data.performanceCaseId ?? null,
      },
      include: {
        recordedBy: { select: { id: true, name: true } },
        performanceCase: {
          select: { id: true, type: true, title: true, occurredAt: true },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "separation_record_created",
        entityType: "SeparationRecord",
        entityId: created.id,
        details: {
          subjectUserId: data.userId,
          subjectName: user.name,
          reason: data.reason,
          lastWorkingDay: data.lastWorkingDay,
        },
      },
    });

    logger.info("Separation record created", {
      recordId: created.id,
      subjectUserId: data.userId,
      reason: data.reason,
      actorId: session!.user.id,
    });

    // 2026-07-08: Push termination to Employment Hero so payroll
    // doesn't keep the person active. Non-blocking — sync status is
    // stamped onto the record so the UI can show the outcome.
    await syncTerminationToEH(created.id, data.userId, data.lastWorkingDay);
    // Re-read to include the updated ehTerminationSyncedAt/Error.
    const fresh = await prisma.separationRecord.findUnique({
      where: { id: created.id },
      include: {
        recordedBy: { select: { id: true, name: true } },
        performanceCase: {
          select: { id: true, type: true, title: true, occurredAt: true },
        },
      },
    });

    return NextResponse.json(fresh ?? created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const PATCH = withApiAuth(
  async (req, session) => {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) throw ApiError.badRequest("userId is required");

    const existing = await prisma.separationRecord.findUnique({
      where: { userId },
    });
    if (!existing || existing.deleted) {
      throw ApiError.notFound("Separation record not found");
    }

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
    if (p.reason !== undefined) update.reason = p.reason;
    if (p.reasonDetail !== undefined) update.reasonDetail = p.reasonDetail;
    if (p.noticeStartDate !== undefined)
      update.noticeStartDate = toDateOnly(p.noticeStartDate);
    if (p.lastWorkingDay !== undefined)
      update.lastWorkingDay = toDateOnly(p.lastWorkingDay);
    if (p.noticePeriodWeeks !== undefined)
      update.noticePeriodWeeks = p.noticePeriodWeeks;
    if (p.finalPayProcessed !== undefined)
      update.finalPayProcessed = p.finalPayProcessed;
    if (p.finalPayProcessedAt !== undefined)
      update.finalPayProcessedAt = toDateTime(p.finalPayProcessedAt);
    if (p.finalPayNotes !== undefined) update.finalPayNotes = p.finalPayNotes;
    if (p.referenceLetterIssued !== undefined)
      update.referenceLetterIssued = p.referenceLetterIssued;
    if (p.referenceLetterUrl !== undefined)
      update.referenceLetterUrl = p.referenceLetterUrl;
    if (p.referenceNotes !== undefined) update.referenceNotes = p.referenceNotes;
    if (p.eligibleForRehire !== undefined)
      update.eligibleForRehire = p.eligibleForRehire;
    if (p.rehireNotes !== undefined) update.rehireNotes = p.rehireNotes;
    if (p.exitInterviewCompleted !== undefined)
      update.exitInterviewCompleted = p.exitInterviewCompleted;
    if (p.exitInterviewNotes !== undefined)
      update.exitInterviewNotes = p.exitInterviewNotes;
    if (p.exitInterviewAt !== undefined)
      update.exitInterviewAt = toDateTime(p.exitInterviewAt);
    if (p.performanceCaseId !== undefined)
      update.performanceCaseId = p.performanceCaseId;

    const updated = await prisma.separationRecord.update({
      where: { userId },
      data: update,
      include: {
        recordedBy: { select: { id: true, name: true } },
        performanceCase: {
          select: { id: true, type: true, title: true, occurredAt: true },
        },
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "separation_record_updated",
        entityType: "SeparationRecord",
        entityId: existing.id,
        details: JSON.parse(
          JSON.stringify({
            subjectUserId: userId,
            changes: update,
            previousReason: existing.reason,
          }),
        ),
      },
    });

    logger.info("Separation record updated", {
      recordId: existing.id,
      actorId: session!.user.id,
      changedKeys: Object.keys(update),
    });

    // 2026-07-08: Re-sync termination to EH if the last working day
    // actually changed. Other PATCH fields (reason notes, final-pay
    // flag, references) don't touch EH so we don't ping it on every
    // save — only when the operative date shifts.
    if (p.lastWorkingDay !== undefined) {
      await syncTerminationToEH(existing.id, userId, p.lastWorkingDay);
      const fresh = await prisma.separationRecord.findUnique({
        where: { userId },
        include: {
          recordedBy: { select: { id: true, name: true } },
          performanceCase: {
            select: { id: true, type: true, title: true, occurredAt: true },
          },
        },
      });
      return NextResponse.json(fresh ?? updated);
    }

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
