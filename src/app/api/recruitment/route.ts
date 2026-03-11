import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status");
  const role = searchParams.get("role");
  const page = parseInt(searchParams.get("page") || "1", 10);
  const limit = parseInt(searchParams.get("limit") || "50", 10);

  const where: Record<string, unknown> = { deleted: false };
  if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status;
  if (role) where.role = role;

  const [vacancies, total] = await Promise.all([
    prisma.recruitmentVacancy.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignedTo: { select: { id: true, name: true } },
        _count: { select: { candidates: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.recruitmentVacancy.count({ where }),
  ]);

  return NextResponse.json({ vacancies, total, page, limit });
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const { serviceId, role, employmentType, qualificationRequired, postedChannels, targetFillDate, notes, assignedToId } = body;

  if (!serviceId || !role || !employmentType) {
    return NextResponse.json(
      { error: "serviceId, role, and employmentType are required" },
      { status: 400 }
    );
  }

  const vacancy = await prisma.recruitmentVacancy.create({
    data: {
      serviceId,
      role,
      employmentType,
      qualificationRequired: qualificationRequired || null,
      postedChannels: postedChannels || [],
      targetFillDate: targetFillDate ? new Date(targetFillDate) : null,
      notes: notes || null,
      assignedToId: assignedToId || null,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(vacancy, { status: 201 });
}
