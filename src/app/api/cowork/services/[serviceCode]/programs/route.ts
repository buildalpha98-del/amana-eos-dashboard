import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { resolveServiceByCode } from "../../../_lib/resolve-service";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const importProgramsSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD").optional(),
  weekCommencing: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekCommencing must be YYYY-MM-DD").optional(),
  activities: z
    .array(
      z.object({
        day: z.enum([...WEEK_DAYS], {
          error: `day must be one of: ${WEEK_DAYS.join(", ")}`,
        }),
        startTime: z.string().regex(/^\d{2}:\d{2}$/, "startTime must be HH:mm"),
        endTime: z.string().regex(/^\d{2}:\d{2}$/, "endTime must be HH:mm"),
        title: z.string().min(1, "Title is required").max(200),
        description: z.string().max(1000).optional(),
        staffName: z.string().max(100).optional(),
        location: z.string().max(200).optional(),
        notes: z.string().max(500).optional(),
        mtopOutcomes: z.array(z.number().int().min(1).max(5)).optional(),
        programmeBrand: z.string().max(50).optional(),
      }),
    )
    .min(1, "At least one activity is required"),
});

// POST /api/cowork/services/[serviceCode]/programs — Import program activities
export const POST = withApiHandler(async (req, context) => {
  // 1. Authenticate
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  // 2. Rate limit

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
    const body = await req.json();
    const parsed = importProgramsSchema.safeParse(body);
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
    const { activities } = parsed.data;
    const weekDate = new Date(weekStartStr);

    // 5. Transaction: delete existing + recreate
    const result = await prisma.$transaction(async (tx) => {
      await tx.programActivity.deleteMany({
        where: { serviceId: service.id, weekStart: weekDate },
      });

      if (activities.length > 0) {
        await tx.programActivity.createMany({
          data: activities.map((a) => ({
            serviceId: service.id,
            weekStart: weekDate,
            day: a.day,
            startTime: a.startTime,
            endTime: a.endTime,
            title: a.title,
            description: a.description || null,
            staffName: a.staffName || null,
            location: a.location || null,
            notes: a.notes || null,
            mtopOutcomes: a.mtopOutcomes || [],
            programmeBrand: a.programmeBrand || null,
            createdById: "cowork",
          })),
        });
      }

      return tx.programActivity.findMany({
        where: { serviceId: service.id, weekStart: weekDate },
        orderBy: [{ day: "asc" }, { startTime: "asc" }],
      });
    });

    // 6. Activity log
    await prisma.activityLog.create({
      data: {
        userId: "cowork",
        action: "api_import",
        entityType: "ProgramActivity",
        entityId: service.id,
        details: {
          serviceCode,
          serviceName: service.name,
          weekStart: weekStartStr,
          count: activities.length,
          via: "api_key",
          keyName: "Cowork Automation",
        },
      },
    });

    return NextResponse.json(
      { service: { code: service.code, name: service.name }, weekStart: weekStartStr, activities: result },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Cowork Programs Import", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
