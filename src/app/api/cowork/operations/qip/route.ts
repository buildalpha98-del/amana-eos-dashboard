import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const qualityAreaSchema = z.object({
  qualityArea: z.number().min(1).max(7).optional(),
  qualityAreaNumber: z.number().min(1).max(7).optional(),
  strengths: z.string().nullable().optional(),
  areasForImprovement: z.string().nullable().optional(),
  improvementGoal: z.string().nullable().optional(),
  strategies: z.string().nullable().optional(),
  timeline: z.string().nullable().optional(),
  responsiblePerson: z.string().nullable().optional(),
  evidenceIndicators: z.string().nullable().optional(),
  evidenceCollected: z.string().nullable().optional(),
  progressNotes: z.string().nullable().optional(),
  progressStatus: z.string().optional(),
});

const postBodySchema = z.object({
  serviceId: z.string().min(1),
  qualityAreas: z.array(qualityAreaSchema).min(1),
  status: z.string().optional(),
  documentType: z.string().optional(),
});

const QA_NAMES = [
  "Educational Program and Practice",
  "Children's Health and Safety",
  "Physical Environment",
  "Staffing Arrangements",
  "Relationships with Children",
  "Collaborative Partnerships",
  "Governance and Leadership",
];

/**
 * GET /api/cowork/operations/qip — Read QIP by serviceId
 * Scope: operations:read
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  try {
    if (serviceId) {
      const qip = await prisma.qualityImprovementPlan.findUnique({
        where: { serviceId },
        include: {
          service: { select: { id: true, name: true, code: true, state: true } },
          qualityAreas: { orderBy: { qualityArea: "asc" } },
        },
      });
      if (!qip) return NextResponse.json({ error: "QIP not found for this service" }, { status: 404 });
      return NextResponse.json(qip);
    }

    // List all QIPs
    const qips = await prisma.qualityImprovementPlan.findMany({
      include: {
        service: { select: { id: true, name: true, code: true, state: true } },
        qualityAreas: { orderBy: { qualityArea: "asc" } },
      },
    });
    return NextResponse.json({ qips, count: qips.length });
  } catch (err) {
    logger.error("Cowork QIP GET", { err });
    return NextResponse.json({ error: "Failed to fetch QIP" }, { status: 500 });
  }
});

/**
 * POST /api/cowork/operations/qip — Create or update QIP content
 * Scope: operations:write
 * Body: { serviceId, qualityAreas: [{ qualityArea: 1, strengths, areasForImprovement, ... }] }
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = postBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceId, qualityAreas, status: qipStatus, documentType } = parsed.data;

    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { state: true },
    });
    if (!service) return NextResponse.json({ error: "Service not found" }, { status: 404 });

    // Upsert QIP and all quality areas in a transaction
    const result = await prisma.$transaction(async (tx) => {
      const qip = await tx.qualityImprovementPlan.upsert({
        where: { serviceId },
        update: {
          ...(qipStatus ? { status: qipStatus } : {}),
          ...(documentType ? { documentType } : {}),
        },
        create: {
          serviceId,
          state: service.state || "VIC",
          documentType: documentType || "qip",
          status: qipStatus || "draft",
        },
      });

      // Upsert each quality area
      for (const area of qualityAreas) {
        const qaNum = area.qualityArea || area.qualityAreaNumber;
        if (!qaNum || qaNum < 1 || qaNum > 7) continue;

        await tx.qIPQualityArea.upsert({
          where: { qipId_qualityArea: { qipId: qip.id, qualityArea: qaNum } },
          update: {
            strengths: area.strengths,
            areasForImprovement: area.areasForImprovement,
            improvementGoal: area.improvementGoal,
            strategies: area.strategies,
            timeline: area.timeline,
            responsiblePerson: area.responsiblePerson,
            evidenceIndicators: area.evidenceIndicators,
            evidenceCollected: area.evidenceCollected,
            progressNotes: area.progressNotes,
            progressStatus: area.progressStatus || "not_started",
          },
          create: {
            qipId: qip.id,
            qualityArea: qaNum,
            qualityAreaName: QA_NAMES[qaNum - 1],
            strengths: area.strengths,
            areasForImprovement: area.areasForImprovement,
            improvementGoal: area.improvementGoal,
            strategies: area.strategies,
            timeline: area.timeline,
            responsiblePerson: area.responsiblePerson,
            evidenceIndicators: area.evidenceIndicators,
            evidenceCollected: area.evidenceCollected,
            progressNotes: area.progressNotes,
            progressStatus: area.progressStatus || "not_started",
          },
        });
      }

      return tx.qualityImprovementPlan.findUnique({
        where: { id: qip.id },
        include: {
          service: { select: { id: true, name: true } },
          qualityAreas: { orderBy: { qualityArea: "asc" } },
        },
      });
    });

    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    logger.error("Cowork QIP POST", { err });
    return NextResponse.json({ error: "Failed to upsert QIP" }, { status: 500 });
  }
});
