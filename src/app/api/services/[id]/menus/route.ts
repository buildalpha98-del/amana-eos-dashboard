import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const MEAL_SLOTS = ["morning_tea", "lunch", "afternoon_tea"] as const;

const menuItemSchema = z.object({
  day: z.enum(WEEK_DAYS),
  slot: z.enum(MEAL_SLOTS),
  description: z.string().max(1000),
  allergens: z.array(z.string()).optional(),
});

const saveMenuSchema = z.object({
  weekStart: z.string(),
  notes: z.string().max(1000).optional(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  items: z.array(menuItemSchema),
});

// GET /api/services/[id]/menus?weekStart=YYYY-MM-DD
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const url = new URL(req.url);
  const weekStartParam = url.searchParams.get("weekStart");

  let weekStart: Date;
  if (weekStartParam) {
    weekStart = new Date(weekStartParam);
  } else {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    weekStart = new Date(now);
    weekStart.setDate(diff);
    weekStart.setHours(0, 0, 0, 0);
  }

  const menuWeek = await prisma.menuWeek.findUnique({
    where: {
      serviceId_weekStart: {
        serviceId: id,
        weekStart,
      },
    },
    include: {
      items: {
        orderBy: [{ day: "asc" }, { slot: "asc" }],
      },
      createdBy: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(menuWeek);
});

// PUT /api/services/[id]/menus — upsert full week menu
export const PUT = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = saveMenuSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { weekStart, notes, fileUrl, fileName, items } = parsed.data;
  const weekDate = new Date(weekStart);

  // Filter out empty items
  const nonEmptyItems = items.filter((item) => item.description.trim().length > 0);

  const result = await prisma.$transaction(async (tx) => {
    // Upsert menu week header
    const menuWeek = await tx.menuWeek.upsert({
      where: {
        serviceId_weekStart: {
          serviceId: id,
          weekStart: weekDate,
        },
      },
      update: {
        notes: notes || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
      },
      create: {
        serviceId: id,
        weekStart: weekDate,
        notes: notes || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        createdById: session!.user.id,
      },
    });

    // Delete existing items and recreate
    await tx.menuItem.deleteMany({
      where: { menuWeekId: menuWeek.id },
    });

    if (nonEmptyItems.length > 0) {
      await tx.menuItem.createMany({
        data: nonEmptyItems.map((item) => ({
          menuWeekId: menuWeek.id,
          day: item.day,
          slot: item.slot,
          description: item.description,
          allergens: item.allergens || [],
        })),
      });
    }

    return tx.menuWeek.findUnique({
      where: { id: menuWeek.id },
      include: {
        items: { orderBy: [{ day: "asc" }, { slot: "asc" }] },
        createdBy: { select: { id: true, name: true } },
      },
    });
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MenuWeek",
      entityId: result!.id,
      details: { serviceId: id, weekStart, itemCount: nonEmptyItems.length },
    },
  });

  return NextResponse.json(result);
});
