import { NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { buildScanUrl, generateUniqueShortCode } from "@/lib/activation-qr";

const DAY_MS = 24 * 60 * 60 * 1000;

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("qr code id required");

    const code = await prisma.qrCode.findUnique({
      where: { id },
      include: {
        activation: { select: { id: true, campaign: { select: { name: true } }, service: { select: { name: true } } } },
        service: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        scans: {
          orderBy: { scannedAt: "desc" },
          select: {
            id: true,
            scannedAt: true,
            ipHash: true,
            userAgent: true,
            referrer: true,
            country: true,
            region: true,
            city: true,
          },
        },
      },
    });
    if (!code) throw ApiError.notFound("QR code not found");

    const scanUrl = buildScanUrl(code.shortCode);
    const svg = await QRCode.toString(scanUrl, { type: "svg", margin: 1, width: 256, errorCorrectionLevel: "M" });

    // Build daily timeline (last 30 days).
    const now = new Date();
    const since = new Date(now.getTime() - 30 * DAY_MS);
    const timelineMap = new Map<string, number>();
    for (const s of code.scans) {
      if (s.scannedAt < since) continue;
      const day = s.scannedAt.toISOString().slice(0, 10);
      timelineMap.set(day, (timelineMap.get(day) ?? 0) + 1);
    }
    const timeline = Array.from({ length: 30 }, (_, i) => {
      const d = new Date(now.getTime() - (29 - i) * DAY_MS);
      const key = d.toISOString().slice(0, 10);
      return { date: key, count: timelineMap.get(key) ?? 0 };
    });

    // Aggregate locations.
    const countryCounts = new Map<string, number>();
    const cityCounts = new Map<string, number>();
    for (const s of code.scans) {
      if (s.country) countryCounts.set(s.country, (countryCounts.get(s.country) ?? 0) + 1);
      if (s.city || s.region) {
        const key = [s.city, s.region, s.country].filter(Boolean).join(", ");
        if (key) cityCounts.set(key, (cityCounts.get(key) ?? 0) + 1);
      }
    }
    const topLocations = Array.from(cityCounts.entries())
      .map(([location, count]) => ({ location, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const uniqueIps = new Set(code.scans.filter((s) => s.ipHash).map((s) => s.ipHash));

    return NextResponse.json({
      id: code.id,
      shortCode: code.shortCode,
      scanUrl,
      svg,
      name: code.name,
      description: code.description,
      destinationUrl: code.destinationUrl,
      active: code.active,
      activation: code.activation
        ? { id: code.activation.id, label: `${code.activation.campaign.name} · ${code.activation.service.name}` }
        : null,
      service: code.service,
      createdBy: code.createdBy,
      createdAt: code.createdAt.toISOString(),
      updatedAt: code.updatedAt.toISOString(),
      totals: {
        scans: code.scans.length,
        uniqueVisitors: uniqueIps.size,
      },
      timeline,
      topLocations,
      countryCounts: Array.from(countryCounts.entries()).map(([country, count]) => ({ country, count })),
      recentScans: code.scans.slice(0, 25).map((s) => ({
        id: s.id,
        scannedAt: s.scannedAt.toISOString(),
        userAgent: s.userAgent,
        referrer: s.referrer,
        country: s.country,
        region: s.region,
        city: s.city,
      })),
    });
  },
  { roles: ["marketing", "owner"] },
);

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  destinationUrl: z.string().url().optional(),
  active: z.boolean().optional(),
  activationId: z.string().nullable().optional(),
  serviceId: z.string().nullable().optional(),
  regenerate: z.boolean().optional(),
});

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("qr code id required");

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const existing = await prisma.qrCode.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound("QR code not found");

    const data: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name.trim();
    if (parsed.data.description !== undefined) data.description = parsed.data.description?.trim() || null;
    if (parsed.data.destinationUrl !== undefined) data.destinationUrl = parsed.data.destinationUrl.trim();
    if (parsed.data.active !== undefined) data.active = parsed.data.active;
    if (parsed.data.activationId !== undefined) data.activationId = parsed.data.activationId || null;
    if (parsed.data.serviceId !== undefined) data.serviceId = parsed.data.serviceId || null;
    if (parsed.data.regenerate) data.shortCode = await generateUniqueShortCode();

    const updated = await prisma.qrCode.update({
      where: { id },
      data,
      select: { id: true, shortCode: true, name: true, destinationUrl: true, active: true },
    });
    return NextResponse.json({
      id: updated.id,
      shortCode: updated.shortCode,
      scanUrl: buildScanUrl(updated.shortCode),
      name: updated.name,
      destinationUrl: updated.destinationUrl,
      active: updated.active,
    });
  },
  { roles: ["marketing", "owner"] },
);

export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("qr code id required");

    const existing = await prisma.qrCode.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound("QR code not found");

    // Soft-archive — keep the scan history and don't break old printed flyers.
    await prisma.qrCode.update({
      where: { id },
      data: { active: false },
    });
    return NextResponse.json({ archived: id });
  },
  { roles: ["marketing", "owner"] },
);
