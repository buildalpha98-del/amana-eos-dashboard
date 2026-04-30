import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  serviceCode: z.string().min(1),
  principalName: z.string().nullable().optional(),
  principalEmail: z.string().nullable().optional(),
  lastContactDate: z.string().nullable().optional(),
  contactMethod: z.string().nullable().optional(),
  contactNotes: z.string().nullable().optional(),
  relationshipScore: z.number().nullable().optional(),
  contractStart: z.string().nullable().optional(),
  contractEnd: z.string().nullable().optional(),
  renewalStatus: z.string().optional(),
  riskFlags: z.array(z.string()).optional(),
  nextAction: z.string().nullable().optional(),
  nextActionDate: z.string().nullable().optional(),
});

/**
 * POST /api/cowork/partnerships/relationships
 * Upsert school relationship health data.
 * Used by: part-school-relationship-health, part-renewal-tracker, part-principal-meeting-prep
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceCode, ...data } = parsed.data;

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true, name: true },
    });

    if (!service) {
      return NextResponse.json(
        { error: `Service ${serviceCode} not found` },
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
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/partnerships/relationships", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});
