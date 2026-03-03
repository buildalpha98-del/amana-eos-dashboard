import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createServiceSchema = z.object({
  name: z.string().min(1, "Name is required"),
  code: z.string().min(1, "Code is required"),
  address: z.string().optional(),
  suburb: z.string().optional(),
  state: z.string().optional(),
  postcode: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  managerId: z.string().optional().nullable(),
  capacity: z.number().optional().nullable(),
  operatingDays: z.string().optional(),
  notes: z.string().optional(),
  bscCasualRate: z.number().optional(),
  ascCasualRate: z.number().optional(),
});

// GET /api/services
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  const services = await prisma.service.findMany({
    where,
    include: {
      manager: { select: { id: true, name: true, email: true, avatar: true } },
      _count: {
        select: {
          todos: { where: { deleted: false, status: { not: "complete" } } },
          issues: { where: { deleted: false, status: { not: "closed" } } },
          projects: { where: { deleted: false, status: { not: "complete" } } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(services);
}

// POST /api/services
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createServiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const service = await prisma.service.create({
    data: {
      name: parsed.data.name,
      code: parsed.data.code,
      address: parsed.data.address || null,
      suburb: parsed.data.suburb || null,
      state: parsed.data.state || null,
      postcode: parsed.data.postcode || null,
      phone: parsed.data.phone || null,
      email: parsed.data.email || null,
      managerId: parsed.data.managerId || null,
      capacity: parsed.data.capacity || null,
      operatingDays: parsed.data.operatingDays || null,
      notes: parsed.data.notes || null,
      bscCasualRate: parsed.data.bscCasualRate ?? 0,
      ascCasualRate: parsed.data.ascCasualRate ?? 0,
    },
    include: {
      manager: { select: { id: true, name: true, email: true, avatar: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Service",
      entityId: service.id,
      details: { name: service.name, code: service.code },
    },
  });

  return NextResponse.json(service, { status: 201 });
}
