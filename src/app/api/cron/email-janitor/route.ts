import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { listBrevoLists, deleteBrevoList } from "@/lib/brevo";

/**
 * Daily email janitor — three sweeps:
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

    await guard.complete({ stranded, trackedCleaned, legacyDeleted });
    return NextResponse.json({ ok: true, stranded, trackedCleaned, legacyDeleted });
  } catch (err) {
    await guard.fail(err);
    logger.error("email-janitor cron failed", { err });
    return NextResponse.json({ error: "email-janitor failed" }, { status: 500 });
  }
});
