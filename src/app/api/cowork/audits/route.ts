import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

/**
 * GET /api/cowork/audits — list completed but unreviewed audits
 */
export async function GET(req: NextRequest) {
  const { error } = await authenticateApiKey(req, "audits:read");
  if (error) return error;

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

  return NextResponse.json({ audits, total: audits.length });
}
