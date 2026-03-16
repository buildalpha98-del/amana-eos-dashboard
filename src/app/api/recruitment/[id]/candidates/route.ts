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

  const candidates = await prisma.recruitmentCandidate.findMany({
    where: { vacancyId: id },
    include: {
      referredByUser: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(candidates);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const { name, email, phone, source, notes, referredByUserId, resumeText, resumeFileUrl } = body;

  if (!name || !source) {
    return NextResponse.json(
      { error: "name and source are required" },
      { status: 400 }
    );
  }

  // Verify vacancy exists
  const vacancy = await prisma.recruitmentVacancy.findUnique({
    where: { id },
  });
  if (!vacancy) {
    return NextResponse.json({ error: "Vacancy not found" }, { status: 404 });
  }

  const candidate = await prisma.recruitmentCandidate.create({
    data: {
      vacancyId: id,
      name,
      email: email || null,
      phone: phone || null,
      source,
      notes: notes || null,
      resumeText: resumeText || null,
      resumeFileUrl: resumeFileUrl || null,
      referredByUserId: referredByUserId || null,
    },
  });

  return NextResponse.json(candidate, { status: 201 });
}
