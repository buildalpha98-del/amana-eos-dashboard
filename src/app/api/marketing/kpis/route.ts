import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createKPISchema = z.object({
  name: z.string().min(1, "Name is required"),
  target: z.number(),
  current: z.number().default(0),
  unit: z.string().optional(),
  period: z.enum(["monthly", "quarterly", "yearly"]).default("monthly"),
  category: z
    .enum(["engagement", "growth", "content", "conversion"])
    .default("engagement"),
});

// GET /api/marketing/kpis — list KPIs with optional filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const period = searchParams.get("period");
  const category = searchParams.get("category");

  const kpis = await prisma.marketingKPI.findMany({
    where: {
      deleted: false,
      ...(period ? { period: period as any } : {}),
      ...(category ? { category: category as any } : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });

  return NextResponse.json(kpis);
}

// POST /api/marketing/kpis — create a new KPI
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createKPISchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const kpi = await prisma.marketingKPI.create({
    data: {
      name: parsed.data.name,
      target: parsed.data.target,
      current: parsed.data.current,
      unit: parsed.data.unit || null,
      period: parsed.data.period,
      category: parsed.data.category,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "MarketingKPI",
      entityId: kpi.id,
      details: { name: kpi.name, category: kpi.category },
    },
  });

  return NextResponse.json(kpi, { status: 201 });
}
