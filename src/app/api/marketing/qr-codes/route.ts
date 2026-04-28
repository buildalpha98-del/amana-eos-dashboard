import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  buildScanUrl,
  generateUniqueShortCode,
  publicBaseUrl,
} from "@/lib/activation-qr";

const querySchema = z.object({
  active: z
    .union([z.literal("true"), z.literal("false"), z.literal("all")])
    .optional(),
  serviceId: z.string().optional(),
  activationId: z.string().optional(),
  search: z.string().optional(),
});

export const GET = withApiAuth(
  async (req) => {
    const url = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten());
    const q = parsed.data;

    const where: Record<string, unknown> = {};
    if (!q.active || q.active === "true") where.active = true;
    else if (q.active === "false") where.active = false;
    if (q.serviceId) where.serviceId = q.serviceId;
    if (q.activationId) where.activationId = q.activationId;
    if (q.search) {
      where.OR = [
        { name: { contains: q.search, mode: "insensitive" } },
        { description: { contains: q.search, mode: "insensitive" } },
        { shortCode: { contains: q.search, mode: "insensitive" } },
      ];
    }

    const codes = await prisma.qrCode.findMany({
      where,
      orderBy: [{ active: "desc" }, { createdAt: "desc" }],
      select: {
        id: true,
        shortCode: true,
        name: true,
        description: true,
        destinationUrl: true,
        active: true,
        activationId: true,
        serviceId: true,
        createdAt: true,
        updatedAt: true,
        activation: { select: { id: true, campaign: { select: { name: true } }, service: { select: { name: true } } } },
        service: { select: { id: true, name: true, code: true } },
        createdBy: { select: { id: true, name: true } },
        scans: { select: { ipHash: true } },
      },
      take: 200,
    });

    return NextResponse.json({
      baseUrl: publicBaseUrl(),
      codes: codes.map((c) => {
        const totalScans = c.scans.length;
        const uniqueIps = new Set(c.scans.filter((s) => s.ipHash).map((s) => s.ipHash));
        return {
          id: c.id,
          shortCode: c.shortCode,
          name: c.name,
          description: c.description,
          destinationUrl: c.destinationUrl,
          active: c.active,
          scanUrl: buildScanUrl(c.shortCode),
          totals: {
            scans: totalScans,
            uniqueVisitors: uniqueIps.size,
          },
          activation: c.activation
            ? { id: c.activation.id, label: `${c.activation.campaign.name} · ${c.activation.service.name}` }
            : null,
          service: c.service,
          createdBy: c.createdBy,
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
    });
  },
  { roles: ["marketing", "owner"] },
);

const createSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  destinationUrl: z.string().url("Destination must be a valid URL"),
  activationId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
});

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    if (parsed.data.activationId) {
      const exists = await prisma.campaignActivationAssignment.findUnique({
        where: { id: parsed.data.activationId },
        select: { id: true },
      });
      if (!exists) throw ApiError.badRequest("activationId does not exist");
    }
    if (parsed.data.serviceId) {
      const exists = await prisma.service.findUnique({
        where: { id: parsed.data.serviceId },
        select: { id: true },
      });
      if (!exists) throw ApiError.badRequest("serviceId does not exist");
    }

    const shortCode = await generateUniqueShortCode();
    const created = await prisma.qrCode.create({
      data: {
        shortCode,
        name: parsed.data.name.trim(),
        description: parsed.data.description?.trim() || null,
        destinationUrl: parsed.data.destinationUrl.trim(),
        activationId: parsed.data.activationId || null,
        serviceId: parsed.data.serviceId || null,
        createdById: session.user.id,
      },
      select: { id: true, shortCode: true, name: true, destinationUrl: true, active: true },
    });

    return NextResponse.json(
      {
        id: created.id,
        shortCode: created.shortCode,
        scanUrl: buildScanUrl(created.shortCode),
        name: created.name,
        destinationUrl: created.destinationUrl,
        active: created.active,
      },
      { status: 201 },
    );
  },
  { roles: ["marketing", "owner"] },
);
