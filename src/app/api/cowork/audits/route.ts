import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

// ── Validation ──────────────────────────────────────────────

const auditFindingSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  templateId: z.string().min(1, "templateId is required"),
  qualityArea: z.number().int().min(1).max(7, "qualityArea must be 1-7 (NQS QA1-QA7)"),
  findings: z.array(
    z.object({
      itemId: z.string().min(1),
      question: z.string().optional(),
      result: z.enum(["yes", "no", "na", "not_answered"]),
      notes: z.string().optional(),
      actionRequired: z.string().optional(),
      ratingValue: z.number().int().min(1).max(5).optional(),
    }),
  ).min(1, "At least one finding is required"),
  complianceScore: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});

/**
 * GET /api/cowork/audits — list completed but unreviewed audits
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  const where: Record<string, unknown> = {
    status: "completed",
    reviewedAt: null,
  };
  if (serviceId) where.serviceId = serviceId;

  const audits = await prisma.auditInstance.findMany({
    where,
    include: {
      template: {
        select: { name: true, qualityArea: true, nqsReference: true, responseFormat: true },
      },
      service: { select: { id: true, name: true, code: true } },
      auditor: { select: { id: true, name: true } },
    },
    orderBy: { completedAt: "desc" },
    take: limit,
  });

  const res = NextResponse.json({ audits, total: audits.length });
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
  return res;
});

/**
 * POST /api/cowork/audits — Submit audit findings
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = auditFindingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          issues: parsed.error.issues.map((i) => ({
            path: i.path.join("."),
            message: i.message,
          })),
        },
        { status: 400 },
      );
    }

    const { serviceId, templateId, findings, complianceScore, notes } = parsed.data;

    // Verify template and service exist
    const [template, service] = await Promise.all([
      prisma.auditTemplate.findUnique({ where: { id: templateId } }),
      prisma.service.findUnique({ where: { id: serviceId } }),
    ]);

    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    const now = new Date();

    // Create audit instance with responses
    const instance = await prisma.auditInstance.create({
      data: {
        templateId,
        serviceId,
        auditorId: "cowork",
        scheduledYear: now.getFullYear(),
        scheduledMonth: now.getMonth() + 1,
        dueDate: now,
        status: "completed",
        completedAt: now,
        complianceScore: complianceScore ?? null,
        comments: notes ?? null,
        responses: {
          create: findings.map((f) => ({
            templateItem: { connect: { id: f.itemId } },
            result: f.result,
            notes: f.notes ?? null,
            actionRequired: f.actionRequired ?? null,
            ratingValue: f.ratingValue ?? null,
          })),
        },
      },
      include: {
        template: { select: { name: true, qualityArea: true } },
        service: { select: { name: true, code: true } },
      },
    });

    return NextResponse.json(
      {
        message: "Audit submitted successfully",
        audit: {
          id: instance.id,
          template: instance.template.name,
          service: instance.service.name,
          qualityArea: instance.template.qualityArea,
          complianceScore,
          findingsCount: findings.length,
          completedAt: now.toISOString(),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error("Cowork Audits POST", { err });
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
});
