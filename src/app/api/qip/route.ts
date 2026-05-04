import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
// 2026-04-30: documentType is server-derived from the service's state.
// NSW services use "sat" (Self-Assessment Tool); everywhere else uses
// "qip" (Quality Improvement Plan). Clients don't pass it. The optional
// override is kept for migrations / data fixups that need to force a
// specific type.
const createQipSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  documentType: z.enum(["qip", "sat"]).optional(),
});

/** NSW services use SAT (Self-Assessment Tool). Everywhere else is QIP. */
function deriveDocumentType(state: string | null | undefined): "qip" | "sat" {
  return state === "NSW" ? "sat" : "qip";
}

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
 * GET /api/qip — List all QIPs
 */
export const GET = withApiAuth(async (req, session) => {
const scope = getServiceScope(session);
  const stateScope = getStateScope(session);
  const { searchParams } = new URL(req.url);
  const state = searchParams.get("state");
  const status = searchParams.get("status");

  try {
    const where: Record<string, unknown> = {};
    if (scope) where.serviceId = scope;
    if (stateScope) where.state = stateScope;
    if (state) where.state = state;
    if (status) where.status = status;

    const qips = await prisma.qualityImprovementPlan.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true, state: true } },
        reviewedBy: { select: { id: true, name: true } },
        qualityAreas: { orderBy: { qualityArea: "asc" } },
      },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({ qips, count: qips.length });
  } catch (err) {
    logger.error("QIP GET", { err });
    return NextResponse.json({ error: "Failed to fetch QIPs" }, { status: 500 });
  }
});

/**
 * POST /api/qip — Create QIP for a service (auto-creates 7 quality areas)
 */
export const POST = withApiAuth(async (req, session) => {
  try {
    const body = await parseJsonBody(req);
    const parsed = createQipSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { serviceId, documentType: explicitType } = parsed.data;

    // Get service state
    const service = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { state: true },
    });
    if (!service) {
      return NextResponse.json({ error: "Service not found" }, { status: 404 });
    }

    // Check if QIP already exists
    const existing = await prisma.qualityImprovementPlan.findUnique({
      where: { serviceId },
    });
    if (existing) {
      return NextResponse.json(
        { error: "QIP already exists for this service", qipId: existing.id },
        { status: 409 },
      );
    }

    // Server-derived. NSW → "sat", others → "qip". An explicit override
    // wins (used by migrations/backfills); the UI no longer sends one.
    const documentType = explicitType ?? deriveDocumentType(service.state);

    const qip = await prisma.qualityImprovementPlan.create({
      data: {
        serviceId,
        state: service.state || "VIC",
        documentType,
        qualityAreas: {
          create: QA_NAMES.map((name, i) => ({
            qualityArea: i + 1,
            qualityAreaName: name,
          })),
        },
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
        qualityAreas: { orderBy: { qualityArea: "asc" } },
      },
    });

    return NextResponse.json(qip, { status: 201 });
  } catch (err) {
    logger.error("QIP POST", { err });
    return NextResponse.json({ error: "Failed to create QIP" }, { status: 500 });
  }
  // 2026-04-30: added "member" so the Director of Service can create
  // their own QIP/SAT. Previously they got a 403 the moment they hit
  // "Create QIP" — surfaced in the training session as "QIP action
  // failure".
}, { roles: ["owner", "head_office", "admin", "member"] });
