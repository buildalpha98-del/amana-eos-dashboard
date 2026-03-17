import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { z } from "zod";
import { resolveServiceByCode } from "../_lib/resolve-service";

const STAGES = [
  "new_enquiry",
  "info_sent",
  "nurturing",
  "form_started",
  "enrolled",
  "first_session",
  "day3",
  "week2",
  "month1",
  "retained",
  "cold",
] as const;

/**
 * GET /api/cowork/pipeline
 *
 * Returns aggregated enquiry pipeline stats for Cowork integration.
 * Requires API key with pipeline:read scope.
 *
 * Query params:
 *   - serviceId (optional — filter to a single centre)
 */
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  const baseWhere: Record<string, unknown> = { deleted: false };
  if (serviceId) baseWhere.serviceId = serviceId;

  try {
    const now = new Date();
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);

    // Count per stage
    const stageCounts = await prisma.parentEnquiry.groupBy({
      by: ["stage"],
      where: baseWhere,
      _count: { id: true },
    });

    const countByStage: Record<string, number> = {};
    for (const s of STAGES) countByStage[s] = 0;
    for (const sc of stageCounts) {
      countByStage[sc.stage] = sc._count.id;
    }

    // Count by centre
    const centreCounts = await prisma.parentEnquiry.groupBy({
      by: ["serviceId"],
      where: baseWhere,
      _count: { id: true },
    });

    const serviceIds = centreCounts.map((c) => c.serviceId);
    const services = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true, name: true, code: true },
    });
    const serviceMap = new Map(services.map((s) => [s.id, s]));

    const countByCentre = centreCounts.map((c) => ({
      serviceId: c.serviceId,
      serviceName: serviceMap.get(c.serviceId)?.name || "Unknown",
      serviceCode: serviceMap.get(c.serviceId)?.code || "",
      count: c._count.id,
    }));

    // Average days in each stage
    const allEnquiries = await prisma.parentEnquiry.findMany({
      where: baseWhere,
      select: { stage: true, stageChangedAt: true },
    });

    const avgDaysByStage: Record<string, number> = {};
    const stageDaysAccum: Record<string, { total: number; count: number }> = {};
    for (const e of allEnquiries) {
      const days =
        (now.getTime() - e.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (!stageDaysAccum[e.stage]) {
        stageDaysAccum[e.stage] = { total: 0, count: 0 };
      }
      stageDaysAccum[e.stage].total += days;
      stageDaysAccum[e.stage].count += 1;
    }
    for (const [stage, data] of Object.entries(stageDaysAccum)) {
      avgDaysByStage[stage] =
        Math.round((data.total / data.count) * 10) / 10;
    }

    // Stuck count (>48hrs in same stage, excluding cold/retained)
    const stuckCount = await prisma.parentEnquiry.count({
      where: {
        ...baseWhere,
        stage: { notIn: ["cold", "retained"] },
        stageChangedAt: { lt: fortyEightHoursAgo },
      },
    });

    // Total active (not cold, not retained, not deleted)
    const totalActive = await prisma.parentEnquiry.count({
      where: {
        ...baseWhere,
        stage: { notIn: ["cold", "retained"] },
      },
    });

    // Conversion rates
    const totalEnquiries = Object.values(countByStage).reduce(
      (s, c) => s + c,
      0,
    );
    const totalEnrolled =
      (countByStage.enrolled || 0) +
      (countByStage.first_session || 0) +
      (countByStage.day3 || 0) +
      (countByStage.week2 || 0) +
      (countByStage.month1 || 0) +
      (countByStage.retained || 0);
    const conversionRate =
      totalEnquiries > 0
        ? Math.round((totalEnrolled / totalEnquiries) * 1000) / 10
        : 0;

    const res = NextResponse.json({
      countByStage,
      countByCentre,
      avgDaysByStage,
      stuckCount,
      totalActive,
      totalEnquiries,
      totalEnrolled,
      conversionRate,
    });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res;
  } catch (err) {
    console.error("[Cowork Pipeline]", err);
    return NextResponse.json(
      { error: "Failed to fetch pipeline stats" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const stageEnum = z.enum([
  "new_enquiry",
  "info_sent",
  "nurturing",
  "form_started",
  "enrolled",
  "first_session",
  "day3",
  "week2",
  "month1",
  "retained",
  "cold",
]);

const singleEnquirySchema = z.object({
  serviceCode: z.string(),
  stage: stageEnum,
  parentName: z.string(),
  parentEmail: z.string().email().optional(),
  parentPhone: z.string().optional(),
  childName: z.string().optional(),
  childAge: z.number().int().min(4).max(13).optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  assignedTo: z.string().optional(),
});

const batchEnquirySchema = z.object({
  records: z.array(singleEnquirySchema).max(50),
});

// ---------------------------------------------------------------------------
// POST /api/cowork/pipeline
// ---------------------------------------------------------------------------

/**
 * POST /api/cowork/pipeline
 *
 * Create or upsert parent enquiry records.
 * Accepts a single record OR a batch under the `records` key (max 50).
 *
 * Upsert key: (serviceId + parentEmail + childName) when parentEmail is present.
 * Returns: { success, count, created, updated }
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Normalise to array of records
  let records: z.infer<typeof singleEnquirySchema>[];

  const batchParse = batchEnquirySchema.safeParse(body);
  if (batchParse.success) {
    records = batchParse.data.records;
  } else {
    const singleParse = singleEnquirySchema.safeParse(body);
    if (!singleParse.success) {
      return NextResponse.json(
        { error: "Validation failed", details: singleParse.error.flatten() },
        { status: 422 },
      );
    }
    records = [singleParse.data];
  }

  let created = 0;
  let updated = 0;

  try {
    for (const record of records) {
      const service = await resolveServiceByCode(record.serviceCode);
      if (!service) {
        // Skip records with unknown service codes rather than failing the whole batch
        continue;
      }

      const now = new Date();

      // Determine if we should upsert based on email + childName uniqueness
      const canUpsert = !!record.parentEmail;

      if (canUpsert) {
        const existing = await prisma.parentEnquiry.findFirst({
          where: {
            serviceId: service.id,
            parentEmail: record.parentEmail,
            childName: record.childName ?? null,
            deleted: false,
          },
          select: { id: true },
        });

        if (existing) {
          await prisma.parentEnquiry.update({
            where: { id: existing.id },
            data: {
              stage: record.stage,
              stageChangedAt: now,
              ...(record.notes !== undefined ? { notes: record.notes } : {}),
            },
          });
          updated += 1;
          continue;
        }
      }

      // Resolve assignedTo user id if provided
      let assignedToId: string | undefined;
      if (record.assignedTo) {
        const user = await prisma.user.findFirst({
          where: {
            OR: [
              { name: { equals: record.assignedTo, mode: "insensitive" } },
              { email: { equals: record.assignedTo, mode: "insensitive" } },
            ],
          },
          select: { id: true },
        });
        assignedToId = user?.id;
      }

      await prisma.parentEnquiry.create({
        data: {
          serviceId: service.id,
          stage: record.stage,
          parentName: record.parentName,
          parentEmail: record.parentEmail,
          parentPhone: record.parentPhone,
          childName: record.childName,
          childAge: record.childAge,
          channel: record.source ?? "cowork",
          notes: record.notes,
          assigneeId: assignedToId,
          stageChangedAt: now,
        },
      });
      created += 1;
    }

    return NextResponse.json({
      success: true,
      count: created + updated,
      created,
      updated,
    });
  } catch (err) {
    console.error("[Cowork Pipeline POST]", err);
    return NextResponse.json(
      { error: "Failed to upsert pipeline records" },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// PUT /api/cowork/pipeline
// ---------------------------------------------------------------------------

const putSchema = z.object({
  id: z.string(),
  stage: stageEnum,
  notes: z.string().optional(),
});

/**
 * PUT /api/cowork/pipeline
 *
 * Update the stage (and optionally notes) of an existing enquiry.
 * Returns: { success, record: { id, stage, stageChangedAt } }
 */
export async function PUT(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 422 },
    );
  }

  const { id, stage, notes } = parsed.data;

  try {
    const enquiry = await prisma.parentEnquiry.findFirst({
      where: { id, deleted: false },
      select: { id: true },
    });

    if (!enquiry) {
      return NextResponse.json(
        { error: "Enquiry not found" },
        { status: 404 },
      );
    }

    const now = new Date();
    const updated = await prisma.parentEnquiry.update({
      where: { id },
      data: {
        stage,
        stageChangedAt: now,
        ...(notes !== undefined ? { notes } : {}),
      },
      select: { id: true, stage: true, stageChangedAt: true },
    });

    return NextResponse.json({ success: true, record: updated });
  } catch (err) {
    console.error("[Cowork Pipeline PUT]", err);
    return NextResponse.json(
      { error: "Failed to update pipeline record" },
      { status: 500 },
    );
  }
}
