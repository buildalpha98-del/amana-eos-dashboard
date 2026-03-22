import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";

const checklistItemSchema = z.object({
  category: z.string().optional(),
  label: z.string().min(1),
  sortOrder: z.number().optional(),
  isRequired: z.boolean().optional(),
});

const postBodySchema = z.object({
  date: z.string().min(1),
  sessionType: z.enum(["bsc", "asc", "vc"]).optional(),
  items: z.array(checklistItemSchema).min(1),
  notes: z.string().nullable().optional(),
});

/**
 * POST /api/cowork/services/[serviceCode]/checklists
 * Create/upsert a daily operations checklist for a centre.
 * Called by automation tasks (daily-checklist-*).
 */
export const POST = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true, name: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const body = await req.json();
  const parsed = postBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { date, sessionType = "asc", items, notes } = parsed.data;

  const dateObj = new Date(date + "T00:00:00Z");

  const result = await prisma.$transaction(async (tx) => {
    // Upsert the checklist
    const checklist = await tx.dailyChecklist.upsert({
      where: {
        serviceId_date_sessionType: {
          serviceId: service.id,
          date: dateObj,
          sessionType,
        },
      },
      update: {
        status: "pending",
        notes: notes || null,
      },
      create: {
        serviceId: service.id,
        date: dateObj,
        sessionType,
        status: "pending",
        notes: notes || null,
      },
    });

    // Clear existing items and replace
    await tx.dailyChecklistItem.deleteMany({
      where: { checklistId: checklist.id },
    });

    const createdItems = await tx.dailyChecklistItem.createMany({
      data: items.map(
        (item, index) => ({
          checklistId: checklist.id,
          category: item.category || "general",
          label: item.label,
          sortOrder: item.sortOrder ?? index,
          isRequired: item.isRequired ?? true,
          checked: false,
        })
      ),
    });

    return { checklist, itemCount: createdItems.count };
  });

  return NextResponse.json(
    {
      message: "Daily checklist created",
      checklistId: result.checklist.id,
      serviceCode,
      date,
      sessionType,
      itemCount: result.itemCount,
    },
    { status: 201 }
  );
});

/**
 * GET /api/cowork/services/[serviceCode]/checklists?date=YYYY-MM-DD
 * Fetch checklists for a centre, optionally filtered by date.
 */
export const GET = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { serviceCode } = await context!.params!;

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date");

  const where: Record<string, unknown> = { serviceId: service.id };
  if (date) {
    where.date = new Date(date + "T00:00:00Z");
  }

  const checklists = await prisma.dailyChecklist.findMany({
    where,
    include: {
      items: { orderBy: { sortOrder: "asc" } },
      completedBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
    take: 30,
  });

  return NextResponse.json({ checklists });
});
