import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { z } from "zod";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
/**
 * POST /api/cowork/px
 * Upsert parent experience metrics (single or batch).
 * Supports: photo_compliance, satisfaction_score, communication_audit,
 *   engagement_score, nps_snapshot, welcome_pack_sent, first_week_checkin,
 *   birthday_celebration
 *
 * GET /api/cowork/px
 * Query parent experience metrics with optional filters.
 */

const METRIC_TYPES = [
  "photo_compliance",
  "satisfaction_score",
  "communication_audit",
  "engagement_score",
  "nps_snapshot",
  "welcome_pack_sent",
  "first_week_checkin",
  "birthday_celebration",
] as const;

const singleSchema = z.object({
  serviceCode: z.string(),
  metricType: z.enum(METRIC_TYPES),
  period: z.string(),
  value: z.number().optional(),
  target: z.number().optional(),
  details: z.record(z.string(), z.any()).optional(),
  notes: z.string().optional(),
});

const batchSchema = z.object({
  metrics: z.array(singleSchema).max(50),
});

type SingleInput = z.infer<typeof singleSchema>;

function calcStatus(
  value: number | undefined,
  target: number | undefined
): string | null {
  if (value === undefined || value === null) return null;
  if (target === undefined || target === null) return null;
  if (value >= target) return "exceeding";
  if (value >= target * 0.9) return "on_track";
  if (value >= target * 0.75) return "at_risk";
  return "below_target";
}

async function upsertMetric(input: SingleInput) {
  const service = await prisma.service.findUnique({
    where: { code: input.serviceCode },
    select: { id: true },
  });

  const status = calcStatus(input.value, input.target);

  const record = await prisma.parentExperience.upsert({
    where: {
      serviceCode_metricType_period: {
        serviceCode: input.serviceCode,
        metricType: input.metricType,
        period: input.period,
      },
    },
    update: {
      serviceId: service?.id ?? null,
      value: input.value ?? null,
      target: input.target ?? null,
      status: status ?? undefined,
      details: input.details ?? undefined,
      notes: input.notes ?? null,
    },
    create: {
      serviceCode: input.serviceCode,
      serviceId: service?.id ?? null,
      metricType: input.metricType,
      period: input.period,
      value: input.value ?? null,
      target: input.target ?? null,
      status: status ?? null,
      details: input.details ?? Prisma.DbNull,
      notes: input.notes ?? null,
    },
    select: {
      id: true,
      serviceCode: true,
      metricType: true,
      period: true,
      value: true,
      target: true,
      status: true,
    },
  });

  return record;
}

export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = (await parseJsonBody(req)) as Record<string, unknown>;

    // Determine single vs batch
    if ("metrics" in body) {
      // Batch mode
      const parsed = batchSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Bad Request",
            message: "Validation failed",
            issues: parsed.error.issues,
          },
          { status: 400 }
        );
      }

      const results = [];
      for (const item of parsed.data.metrics) {
        const record = await upsertMetric(item);
        results.push(record);
      }

      return NextResponse.json(
        { success: true, metrics: results, count: results.length },
        { status: 200 }
      );
    } else {
      // Single mode
      const parsed = singleSchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json(
          {
            error: "Bad Request",
            message: "Validation failed",
            issues: parsed.error.issues,
          },
          { status: 400 }
        );
      }

      const record = await upsertMetric(parsed.data);

      return NextResponse.json(
        { success: true, metrics: [record], count: 1 },
        { status: 200 }
      );
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/px", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});

export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const serviceCode = searchParams.get("serviceCode") ?? undefined;
    const metricType = searchParams.get("metricType") ?? undefined;
    const period = searchParams.get("period") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const limitParam = searchParams.get("limit");
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 200) : 50;

    const metrics = await prisma.parentExperience.findMany({
      where: {
        ...(serviceCode ? { serviceCode } : {}),
        ...(metricType ? { metricType } : {}),
        ...(period ? { period } : {}),
        ...(status ? { status } : {}),
      },
      select: {
        id: true,
        serviceCode: true,
        metricType: true,
        period: true,
        value: true,
        target: true,
        status: true,
        details: true,
        notes: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({ success: true, metrics, count: metrics.length });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("GET /cowork/px", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
