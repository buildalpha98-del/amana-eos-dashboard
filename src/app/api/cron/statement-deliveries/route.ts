import { NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { verifyCronSecret, acquireCronLock } from "@/lib/cron-guard";
import { processPendingStatementDeliveries } from "@/lib/billing/statement-delivery";

export const maxDuration = 60;
export const GET = withApiHandler(async req => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;
  const guard = await acquireCronLock("statement-deliveries", "15min");
  if (!guard.acquired) return NextResponse.json({ skipped: true });
  try {
    const attempted = await processPendingStatementDeliveries();
    await guard.complete({ attempted });
    return NextResponse.json({ attempted });
  } catch (error) { await guard.fail(error); throw error; }
});
