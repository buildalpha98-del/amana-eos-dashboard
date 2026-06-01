/**
 * GET /api/wgea-report
 *   ?format=json (default) — returns rows + summary
 *   ?format=csv             — returns CSV download
 *   ?serviceId=X            — filter to one service
 *   ?anonymise=false        — include names (admin disclosure)
 *   ?includeInactive=true   — include inactive users
 *
 * Admin-only. The default `anonymise=true` so accidental downloads
 * don't leak names; admin can flip explicitly when needed.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import {
  buildWgeaReport,
  rowsToCsv,
  summariseRows,
} from "@/lib/wgea-report";

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get("format") ?? "json";
    const serviceId = searchParams.get("serviceId") ?? undefined;
    const anonymise = searchParams.get("anonymise") !== "false";
    const includeInactive = searchParams.get("includeInactive") === "true";

    const rows = await buildWgeaReport({
      serviceId,
      anonymise,
      activeOnly: !includeInactive,
    });

    if (format === "csv") {
      const csv = rowsToCsv(rows);
      const filename = `wgea-workforce-${new Date().toISOString().slice(0, 10)}.csv`;
      return new NextResponse(csv, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    return NextResponse.json({
      rows,
      summary: summariseRows(rows),
      generatedAt: new Date().toISOString(),
      filters: { serviceId, anonymise, includeInactive },
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
