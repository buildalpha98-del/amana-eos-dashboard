import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { listBrevoLists, deleteBrevoList } from "@/lib/brevo";
import { deleteFile } from "@/lib/storage";
import { generateMeetingReview } from "@/lib/meeting-review";
import { sendMeetingDigestSafe } from "@/lib/meeting-digest";

/**
 * Daily email janitor — four sweeps:
 *
 * (a) Stranded sends: `sending` DeliveryLog rows are pre-created by the
 *     campaign send route and terminated in the same request — a crash
 *     mid-dispatch strands them forever. Rows older than 1h → `failed`.
 * (b) Tracked Brevo temp lists: every >=50 send creates a `delivery-<epoch>`
 *     contact list whose id is persisted as `payload._brevoListId`. Once the
 *     send is >2 days old and no longer scheduled, delete the list and mark
 *     the payload `_brevoListCleaned`.
 * (c) Legacy orphans: pre-Phase-5 sends dropped the list id entirely — page
 *     through Brevo's lists and delete `delivery-<epoch>` lists older than
 *     7 days by their epoch-ms name (never one a scheduled send still targets).
 * (d) Frequency-cap ledger retention: MarketingSendRecipient rows only feed
 *     the rolling 7-day cap window — anything older than 30 days is dead
 *     weight (email addresses = PII; keep the table lean).
 *
 * Idempotent: `acquireCronLock("email-janitor", "daily")` guards double-runs,
 * and every sweep is safe to repeat (deleteBrevoList treats 404 as success).
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
/** Max Brevo list deletions per sweep per run — bounds run time + API load. */
const DELETE_CAP = 20;
/** Candidate-row cap for the tracked sweep's JS payload filter. */
const CANDIDATE_CAP = 500;
const LEGACY_PAGE_SIZE = 50;
/** Hard page ceiling for the legacy sweep (50 lists/page → 500 lists max). */
const LEGACY_MAX_PAGES = 10;

function payloadOf(row: { payload: unknown }): Record<string, unknown> {
  return (row.payload ?? {}) as Record<string, unknown>;
}

// Sweep e2 runs inline Sonnet calls (30-90s each) — without this the
// 55s default timeout could kill the whole janitor on one stuck row.
export const maxDuration = 300;

export const GET = withApiHandler(async (req) => {
  const authError = verifyCronSecret(req);
  if (authError) return authError.error;

  const guard = await acquireCronLock("email-janitor", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ skipped: true, reason: guard.reason });
  }

  try {
    const now = Date.now();

    // ── (a) Stranded "sending" rows → failed ──────────────────────
    const { count: stranded } = await prisma.deliveryLog.updateMany({
      where: { status: "sending", createdAt: { lt: new Date(now - HOUR_MS) } },
      data: {
        status: "failed",
        errorMessage:
          "Stranded in 'sending' — dispatch did not complete (janitor)",
      },
    });

    // ── (b) Tracked temp-list cleanup ─────────────────────────────
    // `payload` is untyped Json — Prisma 5.22's JSON `path` filters are
    // Postgres-specific and awkward to assert against prisma-mock, so we
    // fetch a capped candidate set on cheap indexed columns (channel/status/
    // createdAt, plus externalIdType which only the >=50 Brevo-campaign path
    // stamps — the only path that writes _brevoListId) and do the
    // `_brevoListId` / `_brevoListCleaned` filtering in JS. Volumes are tiny
    // (a handful of >=50 sends a week), so the trade is fine.
    const candidates = await prisma.deliveryLog.findMany({
      where: {
        channel: "email",
        externalIdType: "brevo_campaign",
        status: { notIn: ["scheduled"] },
        createdAt: { lt: new Date(now - 2 * DAY_MS) },
      },
      select: { id: true, payload: true },
      orderBy: { createdAt: "desc" },
      take: CANDIDATE_CAP,
    });

    let trackedCleaned = 0;
    for (const row of candidates) {
      if (trackedCleaned >= DELETE_CAP) break;
      const payload = payloadOf(row);
      const listId = payload._brevoListId;
      if (typeof listId !== "number" || payload._brevoListCleaned === true) {
        continue;
      }
      try {
        await deleteBrevoList(listId);
        // Mark per row (not batched) so a mid-run crash never re-deletes
        // already-cleaned lists nor marks undeleted ones as cleaned.
        await prisma.deliveryLog.update({
          where: { id: row.id },
          data: { payload: { ...payload, _brevoListCleaned: true } },
        });
        trackedCleaned++;
      } catch (err) {
        // Leave the row unmarked — it is retried on the next run.
        logger.warn("email-janitor: tracked list delete failed", {
          deliveryLogId: row.id,
          listId,
          err,
        });
      }
    }

    // ── (c) Legacy orphan sweep ───────────────────────────────────
    // Lists a scheduled campaign still targets must never be deleted —
    // Brevo would have nothing to send to.
    const scheduledRows = await prisma.deliveryLog.findMany({
      where: { channel: "email", status: "scheduled" },
      select: { payload: true },
    });
    const protectedListIds = new Set<number>();
    for (const row of scheduledRows) {
      const listId = payloadOf(row)._brevoListId;
      if (typeof listId === "number") protectedListIds.add(listId);
    }

    // Gather pages first, THEN delete — deleting while offset-paginating
    // shifts Brevo's offsets and silently skips lists.
    const allLists: Array<{ id: number; name: string }> = [];
    for (let page = 0; page < LEGACY_MAX_PAGES; page++) {
      const { lists } = await listBrevoLists(
        page * LEGACY_PAGE_SIZE,
        LEGACY_PAGE_SIZE,
      );
      allLists.push(...lists);
      if (lists.length < LEGACY_PAGE_SIZE) break;
    }

    let legacyDeleted = 0;
    const legacyCutoff = now - 7 * DAY_MS;
    for (const list of allLists) {
      if (legacyDeleted >= DELETE_CAP) break;
      const match = /^delivery-(\d+)$/.exec(list.name);
      if (!match) continue;
      if (Number(match[1]) >= legacyCutoff) continue; // too recent
      if (protectedListIds.has(list.id)) continue; // scheduled send target
      try {
        await deleteBrevoList(list.id);
        legacyDeleted++;
      } catch (err) {
        logger.warn("email-janitor: legacy list delete failed", {
          listId: list.id,
          err,
        });
      }
    }

    // ── (d) Frequency-cap ledger retention ────────────────────────
    // The cap only ever looks back CAP_WINDOW_DAYS (7); 30 days keeps a
    // comfortable audit margin while bounding table growth.
    const { count: ledgerPruned } =
      await prisma.marketingSendRecipient.deleteMany({
        where: { sentAt: { lt: new Date(now - 30 * DAY_MS) } },
      });

    // ── (e) Stuck meeting recordings (Phase 2, 2026-08-31) ────────
    // Daily cadence means a stuck recording can sit up to ~24h past the
    // 2h threshold before this sweeps it — accepted in the spec; the UI's
    // status strip shows "still processing" honestly in the meantime.
    const stuckCutoff = new Date(now - 2 * 60 * 60 * 1000);

    // e1: never transcribed — fail + delete any leftover audio blob.
    const stuckRecordings = await prisma.meetingRecording.findMany({
      where: {
        status: { in: ["uploaded", "transcribing"] },
        updatedAt: { lt: stuckCutoff },
      },
      select: { id: true, audioBlobUrl: true },
    });
    let recordingsFailed = 0;
    for (const rec of stuckRecordings) {
      await prisma.meetingRecording.update({
        where: { id: rec.id },
        data: { status: "failed", error: "Transcription timed out" },
      });
      // URL nulled only after a successful delete — a failure leaves the
      // pointer for sweep e3 to retry next run.
      if (rec.audioBlobUrl) {
        try {
          await deleteFile(rec.audioBlobUrl);
          await prisma.meetingRecording.update({
            where: { id: rec.id },
            data: { audioBlobUrl: null },
          });
        } catch (err) {
          logger.warn("email-janitor: stuck recording blob delete failed", {
            recordingId: rec.id,
            err,
          });
        }
      }
      recordingsFailed++;
    }

    // e2: transcribed but summarisation never landed — retry once.
    const stuckTranscribed = await prisma.meetingRecording.findMany({
      where: { status: "transcribed", updatedAt: { lt: stuckCutoff } },
      select: { id: true },
      // Each retry is an inline Sonnet call — bound the run; the rest
      // are picked up tomorrow.
      take: 3,
    });
    let reviewsRetried = 0;
    for (const rec of stuckTranscribed) {
      try {
        const review = await generateMeetingReview(rec.id);
        await prisma.meetingRecording.update({
          where: { id: rec.id },
          data: { aiReview: review as object, status: "complete" },
        });
        sendMeetingDigestSafe(rec.id);
      } catch (err) {
        await prisma.meetingRecording.update({
          where: { id: rec.id },
          data: {
            status: "failed",
            error: err instanceof Error ? err.message : String(err),
          },
        });
      }
      reviewsRetried++;
    }

    // e3: terminal rows still carrying an audio URL = a delete that
    // failed earlier. Audio deletion is a privacy commitment — retry
    // until it lands, then null the pointer.
    const orphanedAudio = await prisma.meetingRecording.findMany({
      where: {
        status: { in: ["complete", "failed"] },
        audioBlobUrl: { not: null },
      },
      select: { id: true, audioBlobUrl: true },
      take: 20,
    });
    let audioSwept = 0;
    for (const rec of orphanedAudio) {
      try {
        await deleteFile(rec.audioBlobUrl!);
        await prisma.meetingRecording.update({
          where: { id: rec.id },
          data: { audioBlobUrl: null },
        });
        audioSwept++;
      } catch (err) {
        logger.warn("email-janitor: orphaned audio delete failed", {
          recordingId: rec.id,
          err,
        });
      }
    }

    await guard.complete({
      stranded,
      trackedCleaned,
      legacyDeleted,
      ledgerPruned,
      recordingsFailed,
      reviewsRetried,
      audioSwept,
    });
    return NextResponse.json({
      ok: true,
      stranded,
      trackedCleaned,
      legacyDeleted,
      ledgerPruned,
      recordingsFailed,
      reviewsRetried,
      audioSwept,
    });
  } catch (err) {
    await guard.fail(err);
    logger.error("email-janitor cron failed", { err });
    return NextResponse.json({ error: "email-janitor failed" }, { status: 500 });
  }
}, { timeoutMs: 280_000 });
