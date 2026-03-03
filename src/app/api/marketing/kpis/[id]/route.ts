import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

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
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const kpi = await prisma.marketingKPI.findUnique({
    where: { id },
  });

  if (!kpi || kpi.deleted) {
    return NextResponse.json({ error: "KPI not found" }, { status: 404 });
  }

  return NextResponse.json(kpi);
}

// PATCH /api/marketing/kpis/:id — update a KPI
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
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
}

// DELETE /api/marketing/kpis/:id — soft delete a KPI
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

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
}
