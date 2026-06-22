import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { generateRocksPdf } from "@/lib/rocks-pdf";
import { getCurrentQuarter } from "@/lib/utils";

export const runtime = "nodejs";

/**
 * GET /api/rocks/pdf?quarter=YYYY-QN — branded PDF list of the
 * quarter's rocks, split into Completed and In Progress sections.
 * Quarter defaults to the current one if omitted.
 */
export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const quarter = searchParams.get("quarter") || getCurrentQuarter();

  const rocks = await prisma.rock.findMany({
    where: { quarter, deleted: false },
    orderBy: [{ status: "asc" }, { priority: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      quarter: true,
      status: true,
      percentComplete: true,
      priority: true,
      owner: { select: { name: true } },
    },
  });

  const doc = await generateRocksPdf(
    rocks.map((r) => ({
      id: r.id,
      title: r.title,
      quarter: r.quarter,
      status: r.status,
      percentComplete: r.percentComplete,
      priority: r.priority,
      owner: r.owner ? { name: r.owner.name ?? "" } : null,
    })),
    quarter,
  );

  const buffer = Buffer.from(doc.output("arraybuffer"));
  const filename = `amana-rocks-${quarter}-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
