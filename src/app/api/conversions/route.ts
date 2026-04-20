import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const patchConversionSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["identified", "contacted", "converted", "declined"]),
  notes: z.string().optional(),
});
// GET /api/conversions — list opportunities with filters
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");
  const sessionType = searchParams.get("sessionType");

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status;
  if (sessionType) where.sessionType = sessionType;

  const opportunities = await prisma.conversionOpportunity.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
    orderBy: [{ casualCount: "desc" }, { createdAt: "desc" }],
  });

  // Summary stats
  const stats = {
    total: opportunities.length,
    identified: opportunities.filter((o) => o.status === "identified").length,
    contacted: opportunities.filter((o) => o.status === "contacted").length,
    converted: opportunities.filter((o) => o.status === "converted").length,
    declined: opportunities.filter((o) => o.status === "declined").length,
    totalCasualBookings: opportunities.reduce((s, o) => s + o.casualCount, 0),
  };

  return NextResponse.json({ opportunities, stats });
});

// PATCH /api/conversions — update status
export const PATCH = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = patchConversionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { id, status, notes } = parsed.data;

  const data: Record<string, unknown> = { status };
  if (status === "contacted") data.contactedAt = new Date();
  if (status === "converted") data.convertedAt = new Date();
  if (notes !== undefined) data.notes = notes;

  const updated = await prisma.conversionOpportunity.update({
    where: { id },
    data,
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "ConversionOpportunity",
      entityId: updated.id,
      details: { status, familyRef: updated.familyRef },
    },
  });

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin"] });
