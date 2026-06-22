import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import {
  generateAccountabilityChartPdf,
  type SeatNodeForPdf,
} from "@/lib/accountability-chart-pdf";

export const runtime = "nodejs";

/**
 * GET /api/accountability-chart/pdf — branded full export of the
 * accountability chart. Mirrors the V/TO PDF route shape: pull the
 * tree from Prisma, hand it to the generator, return a PDF blob.
 */
export const GET = withApiAuth(async () => {
  const rows = await prisma.accountabilitySeat.findMany({
    orderBy: [{ parentId: "asc" }, { order: "asc" }],
    include: {
      assignees: {
        include: { user: { select: { id: true, name: true } } },
      },
    },
  });

  // Build tree
  const map = new Map<string, SeatNodeForPdf>();
  const roots: SeatNodeForPdf[] = [];
  for (const r of rows) {
    map.set(r.id, {
      id: r.id,
      title: r.title,
      responsibilities: r.responsibilities,
      order: r.order,
      assignees: r.assignees.map((a) => ({
        id: a.user.id,
        name: a.user.name ?? "(unnamed)",
      })),
      children: [],
    });
  }
  for (const r of rows) {
    const node = map.get(r.id)!;
    if (r.parentId && map.has(r.parentId)) {
      map.get(r.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortByOrder = (a: SeatNodeForPdf, b: SeatNodeForPdf) => a.order - b.order;
  roots.sort(sortByOrder);
  for (const node of map.values()) node.children.sort(sortByOrder);

  const doc = await generateAccountabilityChartPdf(roots);
  const buffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `amana-accountability-chart-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
