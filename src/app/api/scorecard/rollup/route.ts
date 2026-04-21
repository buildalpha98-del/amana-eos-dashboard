import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

/**
 * GET /api/scorecard/rollup
 *
 * Org-wide scorecard rollup: all measurables grouped by title, with last-week
 * value per service, plus org-level measurables via a sentinel "_org" key.
 * Admin-tier only.
 */
export const GET = withApiAuth(async () => {
  const [services, measurables] = await Promise.all([
    prisma.service.findMany({
      where: { status: "active" },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.measurable.findMany({
      select: {
        id: true,
        title: true,
        unit: true,
        goalDirection: true,
        goalValue: true,
        serviceId: true,
        service: { select: { id: true, name: true } },
        entries: {
          orderBy: { weekOf: "desc" },
          take: 1,
          select: { weekOf: true, value: true, onTrack: true },
        },
      },
    }),
  ]);

  type Row = {
    title: string;
    unit: string | null;
    goalDirection: string;
    goalValue: number;
    byService: Record<string, { value: number | null; onTrack: boolean | null }>;
  };

  const rowMap = new Map<string, Row>();
  for (const m of measurables) {
    const key = m.title.trim().toLowerCase();
    let row = rowMap.get(key);
    if (!row) {
      row = {
        title: m.title,
        unit: m.unit,
        goalDirection: m.goalDirection,
        goalValue: m.goalValue,
        byService: {},
      };
      rowMap.set(key, row);
    }
    const colKey = m.serviceId ?? "_org";
    const last = m.entries[0];
    row.byService[colKey] = {
      value: last?.value ?? null,
      onTrack: last?.onTrack ?? null,
    };
  }

  const rows = Array.from(rowMap.values()).sort((a, b) =>
    a.title.localeCompare(b.title)
  );

  return NextResponse.json({ services, rows });
}, { roles: [...ADMIN_ROLES] });
