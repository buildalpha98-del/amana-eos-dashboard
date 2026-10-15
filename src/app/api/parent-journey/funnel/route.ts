/** GET /api/parent-journey/funnel?days=90 — the Parent Journey funnel (src/lib/parent-funnel.ts). */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { getParentFunnel } from "@/lib/parent-funnel";

export const GET = withApiAuth(
  async (req) => {
    const raw = Number(new URL(req.url).searchParams.get("days") ?? 90);
    const days = [30, 90, 180, 365].includes(raw) ? raw : 90;
    return NextResponse.json({ days, rows: await getParentFunnel(null, days) });
  },
  { roles: ["owner", "head_office", "admin", "marketing"] },
);
