import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";

// ── Schema ─────────────────────────────────────────────────

const itemSchema = z.object({
  childId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sessionType: z.enum(["bsc", "asc", "vc"]),
  action: z.enum(["sign_in", "sign_out", "mark_absent", "undo"]),
  absenceReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
});

const bulkSchema = z.object({
  serviceId: z.string().min(1),
  items: z
    .array(itemSchema)
    .min(1, "At least one item required")
    .max(100, "Max 100 items per batch"),
});

// ── POST: Transactional bulk attendance update ──────────────
//
// Wraps all per-item attendanceRecord upserts + per-(date,sessionType)
// DailyAttendance aggregations in a single prisma.$transaction. Any item
// failing rolls back the whole batch. The failing item's 0-based index is
// surfaced in the error response as `details.failedIndex` so the client can
// highlight the offender.
//
// Per-item action semantics are inlined from the single-item POST at
// /api/attendance/roll-call — intentionally duplicated rather than factored
// so these two routes can evolve independently. Notification fire-and-forget
// calls from the single-item route are NOT invoked here: bulk is typically
// used for admin/backfill work, not real-time sign-in events.

export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = bulkSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }
    const { serviceId, items } = parsed.data;

    try {
      const result = await prisma.$transaction(async (tx) => {
        const createdIds: string[] = [];

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const [y, m, d] = item.date.split("-").map(Number);
          const dateObj = new Date(Date.UTC(y, m - 1, d));
          const uniqueKey = {
            childId_serviceId_date_sessionType: {
              childId: item.childId,
              serviceId,
              date: dateObj,
              sessionType: item.sessionType,
            },
          };

          try {
            let record: { id: string };
            switch (item.action) {
              case "sign_in": {
                const signInTime = new Date();
                record = await tx.attendanceRecord.upsert({
                  where: uniqueKey,
                  update: {
                    status: "present",
                    signInTime,
                    signedInById: session.user.id,
                    notes: item.notes,
                  },
                  create: {
                    childId: item.childId,
                    serviceId,
                    date: dateObj,
                    sessionType: item.sessionType,
                    status: "present",
                    signInTime,
                    signedInById: session.user.id,
                    notes: item.notes,
                  },
                });
                break;
              }
              case "sign_out": {
                const signOutTime = new Date();
                record = await tx.attendanceRecord.upsert({
                  where: uniqueKey,
                  update: {
                    signOutTime,
                    signedOutById: session.user.id,
                  },
                  create: {
                    childId: item.childId,
                    serviceId,
                    date: dateObj,
                    sessionType: item.sessionType,
                    status: "present",
                    signInTime: signOutTime, // auto sign-in if missing
                    signedInById: session.user.id,
                    signOutTime,
                    signedOutById: session.user.id,
                  },
                });
                break;
              }
              case "mark_absent": {
                record = await tx.attendanceRecord.upsert({
                  where: uniqueKey,
                  update: {
                    status: "absent",
                    absenceReason: item.absenceReason ?? null,
                    signInTime: null,
                    signOutTime: null,
                    signedInById: null,
                    signedOutById: null,
                    notes: item.notes,
                  },
                  create: {
                    childId: item.childId,
                    serviceId,
                    date: dateObj,
                    sessionType: item.sessionType,
                    status: "absent",
                    absenceReason: item.absenceReason ?? null,
                    notes: item.notes,
                  },
                });
                break;
              }
              case "undo": {
                record = await tx.attendanceRecord.upsert({
                  where: uniqueKey,
                  update: {
                    status: "booked",
                    signInTime: null,
                    signOutTime: null,
                    signedInById: null,
                    signedOutById: null,
                    absenceReason: null,
                  },
                  create: {
                    childId: item.childId,
                    serviceId,
                    date: dateObj,
                    sessionType: item.sessionType,
                    status: "booked",
                  },
                });
                break;
              }
            }
            createdIds.push(record!.id);
          } catch (err) {
            // Attach the failing item's index so the outer catch can parse it
            // out and surface it in the ApiError.details payload.
            logger.warn("Bulk roll-call item failed", { err, index: i, item });
            const msg = err instanceof Error ? err.message : String(err);
            throw new Error(
              `Item ${i + 1} (child ${item.childId}, ${item.date} ${item.sessionType}): ${msg}|index=${i}`,
            );
          }
        }

        // Re-aggregate DailyAttendance for each unique (date, sessionType)
        // touched — runs only if the item loop succeeded.
        const keys = new Set(items.map((it) => `${it.date}|${it.sessionType}`));
        for (const k of keys) {
          const [dateStr, st] = k.split("|");
          const [y, m, d] = dateStr.split("-").map(Number);
          const dateObj = new Date(Date.UTC(y, m - 1, d));
          const sessionType = st as "bsc" | "asc" | "vc";
          const counts = await tx.attendanceRecord.groupBy({
            by: ["status"],
            where: { serviceId, date: dateObj, sessionType },
            _count: { id: true },
          });
          const attended =
            counts.find((c: { status: string; _count: { id: number } }) => c.status === "present")
              ?._count.id ?? 0;
          const absent =
            counts.find((c: { status: string; _count: { id: number } }) => c.status === "absent")
              ?._count.id ?? 0;
          const totalBooked = counts.reduce(
            (sum: number, c: { _count: { id: number } }) => sum + c._count.id,
            0,
          );
          await tx.dailyAttendance.upsert({
            where: {
              serviceId_date_sessionType: { serviceId, date: dateObj, sessionType },
            },
            update: {
              attended,
              absent,
              enrolled: totalBooked,
              recordedById: session.user.id,
            },
            create: {
              serviceId,
              date: dateObj,
              sessionType,
              attended,
              absent,
              enrolled: totalBooked,
              recordedById: session.user.id,
            },
          });
        }

        return createdIds;
      });

      return NextResponse.json(
        { created: result.length, failed: 0 },
        { status: 200 },
      );
    } catch (err) {
      // If it's already an ApiError (e.g. from parseJsonBody), rethrow as-is.
      if (err instanceof ApiError) throw err;
      const msg = err instanceof Error ? err.message : String(err);
      const idxMatch = msg.match(/\|index=(\d+)$/);
      const failedIndex = idxMatch ? Number(idxMatch[1]) : null;
      const userMsg = msg.replace(/\|index=\d+$/, "");
      throw ApiError.badRequest(
        userMsg,
        failedIndex !== null ? { failedIndex } : undefined,
      );
    }
  },
  { rateLimit: { max: 10, windowMs: 60_000 } },
);
