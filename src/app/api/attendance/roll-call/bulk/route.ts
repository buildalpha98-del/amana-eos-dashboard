import { recordArrival, recordDeparture } from "@/lib/attendance-handover";
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { requireRoomId } from "@/lib/room-resolver";
import { assertServiceAccess } from "@/lib/authz-scope";
import { $Enums } from "@prisma/client";
import { sendSignInNotification, sendSignOutNotification } from "@/lib/notifications/attendance";
import { assertAttendanceRevision } from "@/lib/attendance-revision";

// ── Schema ─────────────────────────────────────────────────

const itemSchema = z.object({
  childId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /**
   * Any room this centre has, not just the three core programmes —
   * Stage 2 of docs/rooms-migration-plan.md. `requireRoomId` is what
   * checks the room actually exists here, so a slot the centre doesn't
   * run is still refused.
   */
  sessionType: z.nativeEnum($Enums.SessionType),
  /**
   * `book` adds a booked slot only where the child has no record yet — it
   * never touches an existing one. "Add child" used `undo` for this, which
   * wiped any sign-in already recorded for that slot.
   */
  action: z.enum(["sign_in", "sign_out", "mark_absent", "undo", "book"]),
  /**
   * The record version the screen showed (`recordRevision`), or null when it
   * showed no record. Required for mark_absent / undo, which overwrite.
   */
  expectedRevision: z.string().regex(/^[a-f0-9]{64}$/).nullable().optional(),
  absenceReason: z.string().max(500).optional(),
  notes: z.string().max(1000).optional(),
  /**
   * Who handed over, for the register (Reg 158) — the door screen's bulk
   * actions send e.g. "Collected from class by educators". Staff escorts,
   * not parents, so no signature is asked for.
   */
  signedByName: z.string().trim().max(120).optional(),
});

const bulkSchema = z.object({
  serviceId: z.string().min(1),
  items: z
    .array(itemSchema)
    .min(1, "At least one item required")
    .max(100, "Max 100 items per batch"),
  /**
   * Send the parent sign-in / sign-out notifications, as a single tap
   * would. The door screen sets it — a real hand-over is happening. The
   * weekly grid leaves it off: that's backfill, and a parent shouldn't get
   * "signed in at 3:05" for last Tuesday.
   */
  notify: z.boolean().optional(),
});

// ── POST: Transactional bulk attendance update ──────────────
//
// Wraps all per-item attendanceRecord upserts + per-(date,sessionType)
// DailyAttendance aggregations in a single prisma.$transaction. Any item
// failing rolls back the whole batch. The failing item's 0-based index is
// surfaced in the error response as `details.failedIndex` so the client can
// highlight the offender.
//
// Arrival and departure share the single-item conditional writes. Notifications
// are sent only after commit, for handovers that actually changed a record.
// Backfill callers leave notifications off.

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
    const { serviceId, items, notify } = parsed.data;
    // Same centre scope as the GET — writing a roll you can't read was
    // possible until 2026-10-08.
    assertServiceAccess(session, serviceId);

    // Resolve rooms before the transaction: a lookup on the global client
    // while the transaction holds a pool connection can starve the pool.
    const roomIds = new Map<string, string>();
    for (const st of new Set(items.map((item) => item.sessionType))) {
      roomIds.set(st, await requireRoomId(serviceId, st));
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const createdIds: string[] = [];
        const notifications: { childId: string; action: "sign_in" | "sign_out"; at: Date }[] = [];
        const childIds = [...new Set(items.map((item) => item.childId))];
        const children = await tx.child.findMany({
          where: { id: { in: childIds }, serviceId },
          select: { id: true },
        });
        const allowed = new Set(children.map((child) => child.id));
        const failedIndex = items.findIndex((item) => !allowed.has(item.childId));
        if (failedIndex !== -1) {
          throw ApiError.notFound("Child not found at this centre.");
        }

        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          const [y, m, d] = item.date.split("-").map(Number);
          const dateObj = new Date(Date.UTC(y, m - 1, d));
          // Stage 1 dual key. Required now — see room-resolver.ts.
          const roomId = roomIds.get(item.sessionType)!;
          const uniqueKey = {
            childId_serviceId_date_sessionType: {
              childId: item.childId,
              serviceId,
              date: dateObj,
              sessionType: item.sessionType,
            },
          };

          try {
            // Locks the row and compares the version this screen saw. Throws
            // a conflict for an overwrite sent without one.
            await assertAttendanceRevision(tx, {
              childId: item.childId, serviceId, date: dateObj,
              sessionType: item.sessionType, roomId, action: item.action,
              actorId: session.user.id, expectedRevision: item.expectedRevision,
            });
            let record: { id: string };
            switch (item.action) {
              case "book": {
                await tx.attendanceRecord.createMany({
                  data: [{ ...uniqueKey.childId_serviceId_date_sessionType, roomId, status: "booked" }],
                  skipDuplicates: true,
                });
                record = (await tx.attendanceRecord.findUnique({ where: uniqueKey }))!;
                break;
              }
              case "sign_in":
              case "sign_out": {
                const at = new Date();
                const handover = await (item.action === "sign_in" ? recordArrival : recordDeparture)(tx, {
                  childId: item.childId, serviceId, roomId, date: dateObj,
                  sessionType: item.sessionType, action: item.action, at,
                  recordedById: session.user.id, signedByName: item.signedByName,
                  signMethod: "staff", notes: item.notes,
                });
                record = handover.record;
                if (handover.changed) notifications.push({ childId: item.childId, action: item.action, at });
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
                    // Clear the hand-over with the times (see the single route).
                    signedInByName: null,
                    signedOutByName: null,
                    signedInMethod: null,
                    signedOutMethod: null,
                    signedInSignature: null,
                    signedOutSignature: null,
                    notes: item.notes,
                  },
                  create: {
                    childId: item.childId,
                    serviceId,
                    date: dateObj,
                    roomId,
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
                    // Clear the hand-over with the times (see the single route).
                    signedInByName: null,
                    signedOutByName: null,
                    signedInMethod: null,
                    signedOutMethod: null,
                    signedInSignature: null,
                    signedOutSignature: null,
                    absenceReason: null,
                  },
                  create: {
                    childId: item.childId,
                    serviceId,
                    date: dateObj,
                    roomId,
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
            if (err instanceof ApiError) {
              // Keep the status (a conflict stays a 409) and say which item.
              throw new ApiError(err.status, `Item ${i + 1}: ${msg}`, { failedIndex: i });
            }
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
          const sessionType = st as $Enums.SessionType;
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
              // Stage 1 dual key — the aggregate row for this slot.
              roomId: roomIds.get(sessionType)!,
              sessionType,
              attended,
              absent,
              enrolled: totalBooked,
              recordedById: session.user.id,
            },
          });
        }

        return { createdIds, notifications };
      });

      if (notify) {
        // After commit, fire-and-forget — same as the single-tap route.
        for (const item of result.notifications) {
          if (item.action === "sign_in") {
            sendSignInNotification(item.childId, serviceId, item.at).catch((err) =>
              logger.error("Bulk sign-in notification failed", { err, childId: item.childId }),
            );
          } else if (item.action === "sign_out") {
            sendSignOutNotification(item.childId, serviceId, item.at).catch((err) =>
              logger.error("Bulk sign-out notification failed", { err, childId: item.childId }),
            );
          }
        }
      }

      return NextResponse.json(
        { created: result.createdIds.length, failed: 0 },
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
