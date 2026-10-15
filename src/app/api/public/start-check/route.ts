/**
 * GET /api/public/start-check?e=&r=&t= — a family tapped an answer in the
 * "Is anything stopping you?" email. Public (it's a link in an email), so
 * the link is signed per enrolment (HMAC); a bad signature changes nothing.
 * Records the answer, tells the centre, and lands on a thank-you page.
 */
import { NextRequest, NextResponse } from "next/server";
import { withApiHandler } from "@/lib/api-handler";
import { checkRateLimit } from "@/lib/rate-limit";
import { NO_SHOW_REASONS, recordNoShowReason, verifyStartCheckToken, type NoShowReason } from "@/lib/attendance-journey";

export const GET = withApiHandler(async (req: NextRequest) => {
  const q = new URL(req.url).searchParams;
  const e = q.get("e") ?? "";
  const r = q.get("r") ?? "";
  const t = q.get("t") ?? "";
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const limited = (await checkRateLimit(`start-check:${ip}`, 20, 15 * 60_000)).limited;
  const valid = !limited && r in NO_SHOW_REASONS && verifyStartCheckToken(e, t);
  if (valid) await recordNoShowReason(e, r as NoShowReason);
  const to = new URL(`/start-check/thanks${valid ? `?r=${r}` : ""}`, req.url);
  return NextResponse.redirect(to, 303);
});
