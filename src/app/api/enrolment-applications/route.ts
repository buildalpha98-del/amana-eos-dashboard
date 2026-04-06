import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

// ── GET /api/enrolment-applications — list sibling enrolment applications ──

export const GET = withApiAuth(async (req: NextRequest) => {
  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId") || undefined;
  const status = searchParams.get("status") || "pending";
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 100);
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (status && status !== "all") where.status = status;

  const [applications, total] = await Promise.all([
    prisma.enrolmentApplication.findMany({
      where,
      include: {
        service: { select: { id: true, name: true } },
        family: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.enrolmentApplication.count({ where }),
  ]);

  return NextResponse.json({
    applications: applications.map((a) => ({
      id: a.id,
      serviceId: a.serviceId,
      serviceName: a.service.name,
      familyId: a.familyId,
      parentName: [a.family.firstName, a.family.lastName].filter(Boolean).join(" ") || a.family.email,
      parentEmail: a.family.email,
      status: a.status,
      type: a.type,
      childFirstName: a.childFirstName,
      childLastName: a.childLastName,
      childDateOfBirth: a.childDateOfBirth.toISOString(),
      sessionTypes: a.sessionTypes,
      startDate: a.startDate?.toISOString() ?? null,
      createdAt: a.createdAt.toISOString(),
      reviewedAt: a.reviewedAt?.toISOString() ?? null,
      reviewedBy: a.reviewedBy?.name ?? null,
      declineReason: a.declineReason,
      notes: a.notes,
    })),
    total,
  });
});
