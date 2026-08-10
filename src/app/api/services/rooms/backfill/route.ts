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
import { backfillRooms, reconcileRooms } from "@/lib/rooms";

export const GET = withApiAuth(
  async () => {
    const { rows, clean } = await reconcileRooms();
    return NextResponse.json({
      clean,
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
    const result = await backfillRooms();
    const { rows, clean } = await reconcileRooms();

    return NextResponse.json({
      ...result,
      clean,
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
