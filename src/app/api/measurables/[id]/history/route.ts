import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

/**
 * GET /api/measurables/[id]/history?weeks=12
 *
 * Returns trailing N weeks of entries for a single measurable, oldest first.
 * Default 12, clamped to [1, 52]. Any authenticated user can read this.
 */
export const GET = withApiAuth(async (req, _session, context) => {
  const params = await context?.params;
  const id = params?.id;
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const { searchParams } = new URL(req.url);
  const weeksRaw = Number.parseInt(searchParams.get("weeks") ?? "12", 10);
  const weeks = Math.max(1, Math.min(52, Number.isFinite(weeksRaw) ? weeksRaw : 12));

  const measurable = await prisma.measurable.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      goalDirection: true,
      goalValue: true,
      unit: true,
      serviceId: true,
    },
  });
  if (!measurable) {
    return NextResponse.json({ error: "Measurable not found" }, { status: 404 });
  }

  const entries = await prisma.measurableEntry.findMany({
    where: { measurableId: id },
    orderBy: { weekOf: "desc" },
    take: weeks,
    select: { weekOf: true, value: true, onTrack: true },
  });

  entries.reverse();

  return NextResponse.json({ measurable, entries });
});
