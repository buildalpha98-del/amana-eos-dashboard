import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const postSchema = z.object({
  serviceCode: z.string(),
  schoolName: z.string(),
  principalName: z.string().optional(),
  principalEmail: z.string().email().optional(),
  relationshipScore: z.number().int().min(1).max(10).optional(),
  status: z.string().optional(),
  contractStart: z.string().optional(),
  contractEnd: z.string().optional(),
  facilityAccess: z.record(z.string(), z.any()).optional(),
  lastPrincipalMeeting: z.string().optional(),
  lastSchoolEvent: z.string().optional(),
  newsletterInclusion: z.boolean().optional(),
  notes: z.string().optional(),
  actionPlan: z.string().optional(),
});

// ---------------------------------------------------------------------------
// POST /api/cowork/partnerships
// ---------------------------------------------------------------------------

/**
 * Upsert a partnership record by serviceCode.
 * Returns: { success, partnership, created }
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", details: parsed.error.flatten() },
        { status: 422 }
      );
    }

    const {
      serviceCode,
      schoolName,
      principalName,
      principalEmail,
      relationshipScore,
      status,
      contractStart,
      contractEnd,
      facilityAccess,
      lastPrincipalMeeting,
      lastSchoolEvent,
      newsletterInclusion,
      notes,
      actionPlan,
    } = parsed.data;

    // Check if it already exists to determine created flag
    const existing = await prisma.partnership.findUnique({
      where: { serviceCode },
      select: { id: true },
    });

    const partnership = await prisma.partnership.upsert({
      where: { serviceCode },
      update: {
        schoolName,
        principalName: principalName ?? undefined,
        principalEmail: principalEmail ?? undefined,
        relationshipScore: relationshipScore ?? undefined,
        status: status ?? undefined,
        contractStart: contractStart ? new Date(contractStart) : undefined,
        contractEnd: contractEnd ? new Date(contractEnd) : undefined,
        facilityAccess: facilityAccess ?? undefined,
        lastPrincipalMeeting: lastPrincipalMeeting
          ? new Date(lastPrincipalMeeting)
          : undefined,
        lastSchoolEvent: lastSchoolEvent ? new Date(lastSchoolEvent) : undefined,
        newsletterInclusion: newsletterInclusion ?? undefined,
        notes: notes ?? undefined,
        actionPlan: actionPlan ?? undefined,
      },
      create: {
        serviceCode,
        schoolName,
        principalName: principalName ?? null,
        principalEmail: principalEmail ?? null,
        relationshipScore: relationshipScore ?? null,
        status: status ?? "active",
        contractStart: contractStart ? new Date(contractStart) : null,
        contractEnd: contractEnd ? new Date(contractEnd) : null,
        facilityAccess: facilityAccess ?? undefined,
        lastPrincipalMeeting: lastPrincipalMeeting
          ? new Date(lastPrincipalMeeting)
          : null,
        lastSchoolEvent: lastSchoolEvent ? new Date(lastSchoolEvent) : null,
        newsletterInclusion: newsletterInclusion ?? false,
        notes: notes ?? null,
        actionPlan: actionPlan ?? null,
      },
    });

    return NextResponse.json(
      {
        success: true,
        partnership,
        created: !existing,
      },
      { status: existing ? 200 : 201 }
    );
  } catch (error) {
    console.error("[POST /api/cowork/partnerships]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// GET /api/cowork/partnerships
// ---------------------------------------------------------------------------

/**
 * Query partnerships with optional filters.
 * Query params: serviceCode, status, minScore, maxScore
 * Returns: { success, partnerships, count }
 */
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const serviceCode = searchParams.get("serviceCode") ?? undefined;
    const status = searchParams.get("status") ?? undefined;
    const minScore = searchParams.get("minScore");
    const maxScore = searchParams.get("maxScore");

    const where: Record<string, unknown> = {};
    if (serviceCode) where.serviceCode = serviceCode;
    if (status) where.status = status;
    if (minScore || maxScore) {
      where.relationshipScore = {
        ...(minScore ? { gte: parseInt(minScore, 10) } : {}),
        ...(maxScore ? { lte: parseInt(maxScore, 10) } : {}),
      };
    }

    const partnerships = await prisma.partnership.findMany({
      where,
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      success: true,
      partnerships,
      count: partnerships.length,
    });
  } catch (error) {
    console.error("[GET /api/cowork/partnerships]", error);
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
