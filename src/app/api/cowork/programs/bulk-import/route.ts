import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { resolveServicesByCode } from "../../_lib/resolve-service";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const WEEK_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday"] as const;

const activityItem = z.object({
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
});

const bulkImportSchema = z.object({
  weekStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "weekStart must be YYYY-MM-DD"),
  services: z
    .array(
      z.object({
        serviceCode: z.string().min(1, "serviceCode is required"),
        activities: z.array(activityItem).min(1, "At least one activity per service"),
      }),
    )
    .min(1, "At least one service is required"),
});

interface ServiceResult {
  serviceCode: string;
  serviceName: string;
  status: "success" | "error";
  count?: number;
  error?: string;
}

// POST /api/cowork/programs/bulk-import — Push programs to multiple centres
export const POST = withApiHandler(async (req) => {
  // 1. Authenticate
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  // 2. Rate limit

  try {
    // 3. Validate body
    const body = await req.json();
    const parsed = bulkImportSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 },
      );
    }

    const { weekStart, services } = parsed.data;
    const weekDate = new Date(weekStart);

    // 4. Resolve all service codes at once
    const serviceCodes = services.map((s) => s.serviceCode);
    const serviceMap = await resolveServicesByCode(serviceCodes);

    // 5. Process each service
    const results: ServiceResult[] = [];

    for (const { serviceCode, activities } of services) {
      const service = serviceMap.get(serviceCode);

      if (!service) {
        results.push({
          serviceCode,
          serviceName: "",
          status: "error",
          error: `Service with code "${serviceCode}" not found`,
        });
        continue;
      }

      try {
        await prisma.$transaction(async (tx) => {
          // Delete existing activities for this week
          await tx.programActivity.deleteMany({
            where: { serviceId: service.id, weekStart: weekDate },
          });

          // Create new activities
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
              createdById: "cowork",
            })),
          });
        });

        // Log per service
        await prisma.activityLog.create({
          data: {
            userId: "cowork",
            action: "api_import",
            entityType: "ProgramActivity",
            entityId: service.id,
            details: {
              serviceCode,
              serviceName: service.name,
              weekStart,
              count: activities.length,
              via: "api_key",
              keyName: "Cowork Automation",
              bulk: true,
            },
          },
        });

        results.push({
          serviceCode,
          serviceName: service.name,
          status: "success",
          count: activities.length,
        });
      } catch (err) {
        logger.error("Bulk import failed", { serviceCode, err });
        results.push({
          serviceCode,
          serviceName: service.name,
          status: "error",
          error: "Transaction failed",
        });
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const failCount = results.filter((r) => r.status === "error").length;

    return NextResponse.json(
      {
        weekStart,
        summary: { total: results.length, succeeded: successCount, failed: failCount },
        results,
      },
      { status: failCount === results.length ? 422 : 201 },
    );
  } catch (err) {
    logger.error("Cowork Bulk Import", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
