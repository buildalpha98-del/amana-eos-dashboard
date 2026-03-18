import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/sequences/enrolments — list sequence enrolments with filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type") || undefined;
  const status = searchParams.get("status") || undefined;
  const sequenceId = searchParams.get("sequenceId") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 200);

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (sequenceId) where.sequenceId = sequenceId;
  if (type) {
    where.sequence = { type: type as "parent_nurture" | "crm_outreach" };
  }

  const [enrolments, total] = await Promise.all([
    prisma.sequenceEnrolment.findMany({
      where,
      include: {
        sequence: { select: { id: true, name: true, type: true } },
        contact: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
          },
        },
        lead: {
          select: {
            id: true,
            schoolName: true,
            contactName: true,
          },
        },
        executions: {
          orderBy: { scheduledFor: "asc" },
          select: {
            id: true,
            stepId: true,
            scheduledFor: true,
            status: true,
            sentAt: true,
          },
        },
      },
      orderBy: { enrolledAt: "desc" },
      take: limit,
    }),
    prisma.sequenceEnrolment.count({ where }),
  ]);

  return NextResponse.json({ enrolments, total });
}
