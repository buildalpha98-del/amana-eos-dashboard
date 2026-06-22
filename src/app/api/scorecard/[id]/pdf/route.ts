import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { generateScorecardPdf } from "@/lib/scorecard-pdf";

export const runtime = "nodejs";

/**
 * GET /api/scorecard/[id]/pdf — branded table-style PDF export of a
 * single scorecard. Rows = measurables, columns = recent weeks (most
 * recent first), with Owner/Measurable/Goal as fixed left-hand
 * columns. Cells tint green/red by the entry's on-track flag.
 */
export const GET = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;

  const scorecard = await prisma.scorecard.findUnique({
    where: { id },
    include: {
      owner: { select: { name: true } },
      measurables: {
        orderBy: { sortOrder: "asc" },
        include: {
          owner: { select: { name: true } },
          entries: {
            orderBy: { weekOf: "desc" },
            select: { weekOf: true, value: true, onTrack: true },
          },
        },
      },
    },
  });

  if (!scorecard) throw new ApiError(404, "Scorecard not found");

  const doc = await generateScorecardPdf({
    title: scorecard.title,
    ownerName: scorecard.owner?.name ?? null,
    measurables: scorecard.measurables.map((m) => ({
      id: m.id,
      title: m.title,
      ownerName: m.owner?.name ?? null,
      goalValue: m.goalValue,
      goalDirection: m.goalDirection,
      unit: m.unit,
      entries: m.entries.map((e) => ({
        weekOf: e.weekOf.toISOString().slice(0, 10),
        value: e.value,
        onTrack: e.onTrack,
      })),
    })),
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const safeTitle = scorecard.title.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase();
  const filename = `amana-scorecard-${safeTitle}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
