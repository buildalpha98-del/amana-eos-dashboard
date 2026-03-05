import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createQualificationSchema = z.object({
  type: z.enum([
    "cert_iii",
    "diploma",
    "bachelor",
    "masters",
    "first_aid",
    "wwcc",
    "other",
  ]),
  name: z.string().min(1, "Name is required"),
  institution: z.string().optional(),
  completedDate: z.string().optional(),
  expiryDate: z.string().optional(),
  certificateUrl: z.string().url().optional(),
  verified: z.boolean().default(false),
});

// POST /api/users/[id]/qualifications — owner/admin only
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = createQualificationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const qualification = await prisma.staffQualification.create({
    data: {
      userId: id,
      type: parsed.data.type,
      name: parsed.data.name,
      institution: parsed.data.institution || null,
      completedDate: parsed.data.completedDate
        ? new Date(parsed.data.completedDate)
        : null,
      expiryDate: parsed.data.expiryDate
        ? new Date(parsed.data.expiryDate)
        : null,
      certificateUrl: parsed.data.certificateUrl || null,
      verified: parsed.data.verified,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "StaffQualification",
      entityId: qualification.id,
      details: { name: qualification.name, type: qualification.type, forUserId: id },
    },
  });

  return NextResponse.json(qualification, { status: 201 });
}
