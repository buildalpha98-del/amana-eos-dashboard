/**
 * GET /api/hq?week=YYYY-MM-DD&month=YYYY-MM&termStart=YYYY-MM-DD — Amana
 * HQ's Network Summary (src/lib/hq-summary.ts).
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { hqSummary } from "@/lib/hq-summary";
import { HQ_ROLES, hqServiceIds } from "@/lib/hq-access";

const isDay = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : undefined);

export const GET = withApiAuth(
  async (req, session) => {
    const q = new URL(req.url).searchParams;
    const month = q.get("month");
    return NextResponse.json(
      await hqSummary({
        week: isDay(q.get("week")),
        termStart: isDay(q.get("termStart")),
        month: month && /^\d{4}-\d{2}$/.test(month) ? month : undefined,
        serviceIds: await hqServiceIds(session),
      }),
    );
  },
  { roles: HQ_ROLES },
);
