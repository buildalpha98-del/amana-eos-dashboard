import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { logCoworkActivity } from "@/app/api/cowork/_lib/cowork-activity-log";
import { resolveServiceByCode } from "../../../_lib/resolve-service";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const MEAL_SLOTS = ["morning_tea", "lunch", "afternoon_tea"] as const;

const importMenuSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD").optional(),
  weekCommencing: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekCommencing must be YYYY-MM-DD").optional(),
  notes: z.string().max(1000).optional(),
  items: z
    .array(
      z.object({
        day: z.enum([...WEEK_DAYS], {
          error: `day must be one of: ${WEEK_DAYS.join(", ")}`,
        }),
        slot: z.enum([...MEAL_SLOTS], {
          error: `slot must be one of: ${MEAL_SLOTS.join(", ")}`,
        }),
        description: z.string().max(1000),
        allergens: z.array(z.string()).optional(),
      }),
    )
    .min(1, "At least one menu item is required"),
});

// POST /api/cowork/services/[serviceCode]/menus — Import menu for a week
export const POST = withApiHandler(async (req, context) => {
  // 1. Authenticate
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    // 3. Resolve service
    const { serviceCode } = await context!.params!;
    const service = await resolveServiceByCode(serviceCode);
    if (!service) {
      return NextResponse.json(
        { error: `Service with code "${serviceCode}" not found` },
        { status: 404 },
      );
    }

    // 4. Validate body
    const body = await parseJsonBody(req);
    const parsed = importMenuSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const weekStartStr = parsed.data.weekStart || parsed.data.weekCommencing;
    if (!weekStartStr) {
      return NextResponse.json(
        { error: "weekStart or weekCommencing (YYYY-MM-DD) is required" },
        { status: 400 },
      );
    }
    const { notes, items } = parsed.data;
    const weekDate = new Date(weekStartStr);

    // Filter out empty descriptions
    const nonEmptyItems = items.filter((item) => item.description.trim().length > 0);

    // 5. Transaction: upsert header + delete/recreate items
    const result = await prisma.$transaction(async (tx) => {
      const menuWeek = await tx.menuWeek.upsert({
        where: {
          serviceId_weekStart: { serviceId: service.id, weekStart: weekDate },
        },
        update: {
          notes: notes || null,
        },
        create: {
          serviceId: service.id,
          weekStart: weekDate,
          notes: notes || null,
          createdById: "cowork",
        },
      });

      // Delete existing items and recreate
      await tx.menuItem.deleteMany({ where: { menuWeekId: menuWeek.id } });

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
        },
      });
    });

    // 6. Activity log
    logCoworkActivity({
      action: "api_import",
      entityType: "MenuWeek",
      entityId: result!.id,
      details: { serviceCode, serviceName: service.name, weekStart: weekStartStr, itemCount: nonEmptyItems.length, via: "api_key", keyName: "Cowork Automation" },
    });

    return NextResponse.json(
      { service: { code: service.code, name: service.name }, menu: result },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Cowork Menus Import", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
