import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope, getStateScope } from "@/lib/service-scope";

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
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

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
    console.error("[QIP GET]", err);
    return NextResponse.json({ error: "Failed to fetch QIPs" }, { status: 500 });
  }
}

/**
 * POST /api/qip — Create QIP for a service (auto-creates 7 quality areas)
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  try {
    const body = await req.json();
    const { serviceId, documentType = "qip" } = body;

    if (!serviceId) {
      return NextResponse.json({ error: "serviceId is required" }, { status: 400 });
    }

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
    console.error("[QIP POST]", err);
    return NextResponse.json({ error: "Failed to create QIP" }, { status: 500 });
  }
}
