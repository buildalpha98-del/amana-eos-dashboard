/**
 * GET /api/public/check-in?c=&r=&t= — a family tapped an answer in the
 * "We've missed Yusuf" email (src/lib/missed-sessions.ts). Signed per child
 * (HMAC); a bad signature records nothing. Lands on /start-check/thanks.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { checkRateLimit } from "@/lib/rate-limit";
import { MISSED_REASONS, recordMissedReason, verifyMissedCheckToken, type MissedReason } from "@/lib/missed-sessions";

export const GET = withApiHandler(async (req: NextRequest) => {
  const q = new URL(req.url).searchParams;
  const c = q.get("c") ?? "";
  const r = q.get("r") ?? "";
  const t = q.get("t") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = (await checkRateLimit(`check-in:${ip}`, 20, 15 * 60_000)).limited;
  const valid = !limited && r in MISSED_REASONS && verifyMissedCheckToken(c, t);
  if (valid) await recordMissedReason(c, r as MissedReason);
  return NextResponse.redirect(new URL(`/start-check/thanks${valid ? `?r=${r}` : ""}`, req.url), 303);
});
