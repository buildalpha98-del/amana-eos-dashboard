import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getStateScope } from "@/lib/service-scope";
import { getCentreScope, applyCentreFilter } from "@/lib/centre-scope";
import { parsePagination } from "@/lib/pagination";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
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
export const GET = withApiAuth(async (req, session) => {
const { serviceIds } = await getCentreScope(session);
  const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;

  // Centre scoping: scoped roles only see their assigned/managed services
  applyCentreFilter(where, serviceIds, "id");
  // State Manager: only see services in their assigned state
  if (stateScope) where.state = stateScope;

  const pagination = parsePagination(searchParams);

  const queryArgs = {
    where,
    include: {
      manager: { select: { id: true, name: true, email: true, avatar: true } },
      _count: {
        select: {
          todos: { where: { deleted: false, status: { not: "complete" as const } } },
          issues: { where: { deleted: false, status: { not: "closed" as const } } },
          projects: { where: { deleted: false, status: { not: "complete" as const } } },
        },
      },
    },
    orderBy: { name: "asc" as const },
    ...(pagination ? { skip: pagination.skip, take: pagination.limit } : {}),
  };

  if (pagination) {
    const [items, total] = await Promise.all([
      prisma.service.findMany(queryArgs),
      prisma.service.count({ where }),
    ]);
    return NextResponse.json({
      items,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  const services = await prisma.service.findMany(queryArgs);
  return NextResponse.json(services);
});

// POST /api/services
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createServiceSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Check for duplicate service code
  const existing = await prisma.service.findFirst({
    where: { code: parsed.data.code },
    select: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: `A service with code "${parsed.data.code}" already exists` },
      { status: 409 }
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
}, { roles: ["owner", "head_office", "admin"] });
