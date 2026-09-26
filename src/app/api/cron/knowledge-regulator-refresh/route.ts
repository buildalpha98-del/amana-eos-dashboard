import { NextResponse } from "next/server";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { runAdapter } from "@/lib/knowledge/sync";

export const maxDuration = 300;

/** Monthly: re-fetch curated regulator pages; unchanged hashes are no-ops. */
export const GET = withApiHandler(
  async (req) => {
    // verifyCronSecret returns null when authorised, { error } otherwise
    // (same as every other cron — see email-janitor/route.ts:47).
    const authError = verifyCronSecret(req);
    if (authError) return authError.error;

    const guard = await acquireCronLock("knowledge-regulator-refresh", "monthly");
    if (!guard.acquired) return NextResponse.json({ skipped: true, reason: guard.reason });
    try {
      const run = await runAdapter("regulator", null);
      await guard.complete({ runId: run.id, counts: run.counts });
      return NextResponse.json({ runId: run.id, counts: run.counts, error: run.error });
    } catch (err) {
      await guard.fail(err);
      throw err;
    }
  },
  // withApiHandler's default timeout is 55s — without a matching override
  // it would race ahead of the 300s maxDuration budget above (same pairing
  // as email-janitor/route.ts and morning-briefing/route.ts).
  { timeoutMs: 280_000 },
);
