import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * POST /api/cowork/partnerships/relationships
 * Upsert school relationship health data.
 * Used by: part-school-relationship-health, part-renewal-tracker, part-principal-meeting-prep
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const body = await req.json();
  const { serviceCode, ...data } = body;

  if (!serviceCode) {
    return NextResponse.json(
      { error: "Bad Request", message: "serviceCode required" },
      { status: 400 }
    );
  }

  const service = await prisma.service.findUnique({
    where: { code: serviceCode },
    select: { id: true, name: true },
  });

  if (!service) {
    return NextResponse.json(
      { error: "Not Found", message: `Service ${serviceCode} not found` },
      { status: 404 }
    );
  }

  const relationship = await prisma.schoolRelationship.upsert({
    where: { serviceId: service.id },
    update: {
      principalName: data.principalName || undefined,
      principalEmail: data.principalEmail || undefined,
      lastContactDate: data.lastContactDate
        ? new Date(data.lastContactDate)
        : undefined,
      contactMethod: data.contactMethod || undefined,
      contactNotes: data.contactNotes || undefined,
      relationshipScore: data.relationshipScore || undefined,
      contractStart: data.contractStart
        ? new Date(data.contractStart)
        : undefined,
      contractEnd: data.contractEnd
        ? new Date(data.contractEnd)
        : undefined,
      renewalStatus: data.renewalStatus || undefined,
      riskFlags: data.riskFlags || undefined,
      nextAction: data.nextAction || undefined,
      nextActionDate: data.nextActionDate
        ? new Date(data.nextActionDate)
        : undefined,
    },
    create: {
      serviceId: service.id,
      principalName: data.principalName || null,
      principalEmail: data.principalEmail || null,
      lastContactDate: data.lastContactDate
        ? new Date(data.lastContactDate)
        : null,
      contactMethod: data.contactMethod || null,
      contactNotes: data.contactNotes || null,
      relationshipScore: data.relationshipScore || null,
      contractStart: data.contractStart
        ? new Date(data.contractStart)
        : null,
      contractEnd: data.contractEnd
        ? new Date(data.contractEnd)
        : null,
      renewalStatus: data.renewalStatus || "active",
      riskFlags: data.riskFlags || [],
      nextAction: data.nextAction || null,
      nextActionDate: data.nextActionDate
        ? new Date(data.nextActionDate)
        : null,
    },
  });

  return NextResponse.json(
    {
      message: "School relationship updated",
      relationshipId: relationship.id,
      serviceCode,
      renewalStatus: relationship.renewalStatus,
      relationshipScore: relationship.relationshipScore,
    },
    { status: 201 }
  );
}
