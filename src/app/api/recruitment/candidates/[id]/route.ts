import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

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
    "name", "email", "phone", "source", "stage",
    "interviewNotes", "notes", "referredByUserId",
  ];

  for (const field of allowedFields) {
    if (field in body) {
      data[field] = body[field];
    }
  }

  // Auto-update stageChangedAt when stage changes
  if ("stage" in body) {
    data.stageChangedAt = new Date();
  }

  const candidate = await prisma.recruitmentCandidate.update({
    where: { id },
    data,
    include: {
      vacancy: {
        select: { id: true, role: true, service: { select: { name: true } } },
      },
    },
  });

  return NextResponse.json(candidate);
}
