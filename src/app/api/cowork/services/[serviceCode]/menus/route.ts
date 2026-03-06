import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";
import { resolveServiceByCode } from "../../../_lib/resolve-service";

const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;
const MEAL_SLOTS = ["morning_tea", "lunch", "afternoon_tea"] as const;

const importMenuSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
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
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ serviceCode: string }> },
) {
  // 1. Authenticate
  const { apiKey, error: authError } = await authenticateApiKey(req, "menus:write");
  if (authError) return authError;

  // 2. Rate limit
  const { limited, resetIn } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json(
      { error: "Too Many Requests", message: "Rate limit exceeded (100 req/min)" },
      { status: 429, headers: { "Retry-After": String(Math.ceil(resetIn / 1000)) } },
    );
  }

  try {
    // 3. Resolve service
    const { serviceCode } = await params;
    const service = await resolveServiceByCode(serviceCode);
    if (!service) {
      return NextResponse.json(
        { error: "Not Found", message: `Service with code "${serviceCode}" not found` },
        { status: 404 },
      );
    }

    // 4. Validate body
    const body = await req.json();
    const parsed = importMenuSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { weekStart, notes, items } = parsed.data;
    const weekDate = new Date(weekStart);

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
          createdById: apiKey!.createdById,
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
    await prisma.activityLog.create({
      data: {
        userId: apiKey!.createdById,
        action: "api_import",
        entityType: "MenuWeek",
        entityId: result!.id,
        details: {
          serviceCode,
          serviceName: service.name,
          weekStart,
          itemCount: nonEmptyItems.length,
          via: "api_key",
          keyName: apiKey!.name,
        },
      },
    });

    return NextResponse.json(
      { service: { code: service.code, name: service.name }, menu: result },
      { status: 201 },
    );
  } catch (err) {
    console.error("[Cowork Menus Import]", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
