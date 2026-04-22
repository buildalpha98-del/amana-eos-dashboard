import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/services/[id]/checklists?date=2026-03-16&sessionType=asc
 * Fetch daily checklists for a service centre (dashboard).
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get("date");
  const sessionType = searchParams.get("sessionType");
  const limit = Math.min(parseInt(searchParams.get("limit") || "10"), 50);

  const where: Record<string, unknown> = { serviceId: id };

  if (dateStr) {
    if (!DATE_RE.test(dateStr)) {
      return NextResponse.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });
    }
    const [y, m, d] = dateStr.split("-").map(Number);
    where.date = new Date(Date.UTC(y, m - 1, d));
  }
  if (sessionType) {
    where.sessionType = sessionType;
  }

  const checklists = await prisma.dailyChecklist.findMany({
    where,
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      completedBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: limit,
  });

  return NextResponse.json({ checklists });
});
