/**
 * GET/POST /api/services/rooms/backfill
 *
 * The Stage 0 gate (docs/rooms-migration-plan.md).
 *
 * The `Room` table shadows `Service.sessionTimes` and nothing reads it
 * yet. That makes its failure mode silent: a room key configured with no
 * row behind it produces no error today, and becomes an invisible record
 * the moment Stage 2 moves a read. So the shadow has to be checked
 * BEFORE it matters, not after.
 *
 * GET reconciles — per service, what the JSON describes against what the
 * table holds, split into missing, drifted and orphaned. POST runs the
 * backfill, then reconciles again and returns the verdict, so a run
 * always says whether it worked rather than just that it finished.
 *
 * Orphans are reported and never deleted. A room reaches that state by
 * being configured and then removed from the JSON, and it may have
 * attendance recorded against it — deleting the row would destroy the
 * only description of what those records referred to.
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import {
  backfillRooms,
  backfillRoomIds,
  countUnresolvedRooms,
  reconcileRooms,
} from "@/lib/rooms";
import { _clearRoomCache } from "@/lib/room-resolver";

export const GET = withApiAuth(
  async () => {
    const { rows, clean } = await reconcileRooms();
    /**
     * Stage 1's half of the gate. Stage 2 cannot move a read until every
     * one of these is zero — a null roomId becomes an invisible record
     * the moment a read switches over.
     */
    const unresolved = (await countUnresolvedRooms()).filter(
      (t) => t.unresolved > 0,
    );

    return NextResponse.json({
      clean: clean && unresolved.length === 0,
      roomsClean: clean,
      unresolved,
      services: rows.length,
      /**
       * Only the services with something to say. A clean run over
       * dozens of centres shouldn't return dozens of rows saying
       * nothing — the exceptions are the report.
       */
      issues: rows.filter(
        (r) =>
          r.missing.length > 0 || r.drifted.length > 0 || r.orphaned.length > 0,
      ),
    });
  },
  { roles: ["owner", "head_office"] },
);

export const POST = withApiAuth(
  async () => {
    // Rooms first, then the foreign keys that point at them — a row
    // cannot resolve to a room that does not exist yet.
    const result = await backfillRooms();
    /**
     * The Stage 0 sync may have created rooms this process has already
     * cached a miss for. Without dropping the cache, the very backfill
     * meant to repair those rows would resolve them to null again.
     */
    _clearRoomCache();
    const filled = await backfillRoomIds();

    const { rows, clean } = await reconcileRooms();
    const unresolved = (await countUnresolvedRooms()).filter(
      (t) => t.unresolved > 0,
    );

    return NextResponse.json({
      ...result,
      filled: filled.filter((t) => t.filled > 0),
      unresolved,
      clean: clean && unresolved.length === 0,
      roomsClean: clean,
      issues: rows.filter(
        (r) =>
          r.missing.length > 0 || r.drifted.length > 0 || r.orphaned.length > 0,
      ),
    });
  },
  {
    // Idempotent, but it walks every service and writes to every room.
    // Nobody needs to run it in a loop.
    rateLimit: { max: 5, windowMs: 60_000 },
    roles: ["owner", "head_office"],
  },
);
