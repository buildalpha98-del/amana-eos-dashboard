import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { generateVtoPdf } from "@/lib/vto-pdf";

export const runtime = "nodejs";

/**
 * GET /api/vto/pdf — branded full V/TO export.
 *
 * Returns a single Amana-branded PDF covering every V/TO field —
 * Core Values, Purpose, Niche, 10-Year Target, 3-Year Picture,
 * 1-Year Goals (with rocks under each), and the four-part Go to
 * Market Strategy. Legacy marketingStrategy text is appended only
 * if still populated.
 */
export const GET = withApiAuth(async () => {
  const vto = await prisma.visionTractionOrganiser.findFirst({
    include: {
      oneYearGoals: {
        orderBy: { createdAt: "asc" },
        include: {
          rocks: {
            where: { deleted: false },
            select: { title: true, status: true, percentComplete: true },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      updatedBy: { select: { name: true } },
    },
  });

  if (!vto) throw new ApiError(404, "No V/TO found");

  const doc = await generateVtoPdf({
    coreValues: vto.coreValues,
    corePurpose: vto.corePurpose,
    coreNiche: vto.coreNiche,
    tenYearTarget: vto.tenYearTarget,
    threeYearPicture: vto.threeYearPicture,
    threeYearFutureDate: vto.threeYearFutureDate
      ? vto.threeYearFutureDate.toISOString()
      : null,
    threeYearRevenue: vto.threeYearRevenue,
    threeYearProfit: vto.threeYearProfit,
    threeYearMeasurables: vto.threeYearMeasurables,
    threeYearLooksLike: vto.threeYearLooksLike,
    marketingStrategy: vto.marketingStrategy,
    gtmTargetMarket: vto.gtmTargetMarket,
    gtmThreeUniques: vto.gtmThreeUniques,
    gtmProvenProcess: vto.gtmProvenProcess,
    gtmGuarantee: vto.gtmGuarantee,
    sectionLabels: (vto.sectionLabels as Record<string, string> | null) ?? null,
    updatedAt: vto.updatedAt.toISOString(),
    updatedBy: vto.updatedBy ? { name: vto.updatedBy.name ?? "" } : null,
    oneYearGoals: vto.oneYearGoals.map((g) => ({
      title: g.title,
      description: g.description,
      targetDate: g.targetDate ? g.targetDate.toISOString() : null,
      status: g.status,
      rocks: g.rocks.map((r) => ({
        title: r.title,
        status: r.status,
        percentComplete: r.percentComplete,
      })),
    })),
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));

  const filename = `amana-vto-${new Date().toISOString().slice(0, 10)}.pdf`;
  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
});
