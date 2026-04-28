import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("activation id required");

    const activation = await prisma.campaignActivationAssignment.findUnique({
      where: { id },
      select: {
        id: true,
        qrShortCode: true,
        qrDestinationUrl: true,
        scheduledFor: true,
      },
    });
    if (!activation) throw ApiError.notFound("Activation not found");

    const sinceWindow = new Date(Date.now() - 90 * DAY_MS);
    const [scans, enquiries, last10Scans, last10Enquiries] = await Promise.all([
      prisma.activationScan.findMany({
        where: { activationId: id, scannedAt: { gte: sinceWindow } },
        select: { scannedAt: true, ipHash: true },
      }),
      prisma.parentEnquiry.findMany({
        where: { sourceActivationId: id, deleted: false },
        select: { id: true, stage: true, createdAt: true },
      }),
      prisma.activationScan.findMany({
        where: { activationId: id },
        orderBy: { scannedAt: "desc" },
        take: 10,
        select: { id: true, scannedAt: true, userAgent: true, referrer: true },
      }),
      prisma.parentEnquiry.findMany({
        where: { sourceActivationId: id, deleted: false },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, parentName: true, stage: true, createdAt: true },
      }),
    ]);

    const totalScans = scans.length;
    const uniqueScans = new Set(
      scans.filter((s) => s.ipHash).map((s) => s.ipHash as string),
    ).size;

    const enrolled = enquiries.filter((e) => e.stage === "enrolled").length;
    const conversionRate = totalScans > 0 ? enquiries.length / totalScans : 0;

    // Daily timeline (last 30 days) for the inline chart.
    const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
    const timeline: Record<string, number> = {};
    for (const s of scans) {
      if (s.scannedAt < thirtyDaysAgo) continue;
      const day = s.scannedAt.toISOString().slice(0, 10);
      timeline[day] = (timeline[day] ?? 0) + 1;
    }
    const days = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(Date.now() - (29 - i) * DAY_MS);
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: timeline[key] ?? 0 };
    });

    return NextResponse.json({
      totals: {
        scans: totalScans,
        uniqueVisitors: uniqueScans,
        enquiries: enquiries.length,
        enrolled,
        conversionRate: Number(conversionRate.toFixed(3)),
      },
      timeline: days,
      recentScans: last10Scans.map((s) => ({
        id: s.id,
        scannedAt: s.scannedAt.toISOString(),
        userAgent: s.userAgent,
        referrer: s.referrer,
      })),
      recentEnquiries: last10Enquiries.map((e) => ({
        id: e.id,
        parentName: e.parentName,
        stage: e.stage,
        createdAt: e.createdAt.toISOString(),
      })),
    });
  },
  { roles: ["marketing", "owner"] },
);
