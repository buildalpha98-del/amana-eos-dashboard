import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  const vacancy = await prisma.recruitmentVacancy.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      assignedTo: { select: { id: true, name: true } },
      filledByUser: { select: { id: true, name: true } },
      candidates: {
        orderBy: { createdAt: "desc" },
        include: {
          referredByUser: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!vacancy) {
    return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
  }

  return NextResponse.json(vacancy);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  const allowedFields = [
    "role", "employmentType", "qualificationRequired", "status",
    "postedChannels", "postedAt", "targetFillDate", "filledAt",
    "filledByUserId", "assignedToId", "notes",
  ];

  for (const field of allowedFields) {
    if (field in body) {
      if (["postedAt", "targetFillDate", "filledAt"].includes(field) && body[field]) {
        data[field] = new Date(body[field]);
      } else {
        data[field] = body[field];
      }
    }
  }

  if (body.status === "filled" && !data.filledAt) {
    data.filledAt = new Date();
  }

  const vacancy = await prisma.recruitmentVacancy.update({
    where: { id },
    data,
    include: {
      service: { select: { id: true, name: true, code: true } },
    },
  });

  return NextResponse.json(vacancy);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  await prisma.recruitmentVacancy.update({
    where: { id },
    data: { deleted: true },
  });

  return NextResponse.json({ success: true });
}
