import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const updateKPISchema = z.object({
  name: z.string().min(1).optional(),
  target: z.number().optional(),
  current: z.number().optional(),
  unit: z.string().optional().nullable(),
  period: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  category: z
    .enum(["engagement", "growth", "content", "conversion"])
    .optional(),
});

// GET /api/marketing/kpis/:id — get a single KPI
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const kpi = await prisma.marketingKPI.findUnique({
    where: { id },
  });

  if (!kpi || kpi.deleted) {
    return NextResponse.json({ error: "KPI not found" }, { status: 404 });
  }

  return NextResponse.json(kpi);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// PATCH /api/marketing/kpis/:id — update a KPI
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updateKPISchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.marketingKPI.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "KPI not found" }, { status: 404 });
  }

  const kpi = await prisma.marketingKPI.update({
    where: { id },
    data: parsed.data,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MarketingKPI",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(kpi);
}, { roles: ["owner", "head_office", "admin", "marketing"] });

// DELETE /api/marketing/kpis/:id — soft delete a KPI
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const existing = await prisma.marketingKPI.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "KPI not found" }, { status: 404 });
  }

  await prisma.marketingKPI.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "MarketingKPI",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin", "marketing"] });
