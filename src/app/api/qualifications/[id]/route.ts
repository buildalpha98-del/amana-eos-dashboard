import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateQualificationSchema = z.object({
  type: z
    .enum([
      "cert_iii",
      "diploma",
      "bachelor",
      "masters",
      "first_aid",
      "wwcc",
      "other",
    ])
    .optional(),
  name: z.string().min(1).optional(),
  institution: z.string().nullable().optional(),
  completedDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  certificateUrl: z.string().url().nullable().optional(),
  verified: z.boolean().optional(),
});

// PATCH /api/qualifications/[id] — owner/admin only
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  const qualification = await prisma.staffQualification.findUnique({
    where: { id },
  });

  if (!qualification) {
    return NextResponse.json(
      { error: "Qualification not found" },
      { status: 404 }
    );
  }

  const body = await req.json();
  const parsed = updateQualificationSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;

    if (["completedDate", "expiryDate"].includes(key)) {
      data[key] = value ? new Date(value as string) : null;
      continue;
    }

    data[key] = value;
  }

  const updated = await prisma.staffQualification.update({
    where: { id },
    data,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "StaffQualification",
      entityId: id,
      details: { fields: Object.keys(data) },
    },
  });

  return NextResponse.json(updated);
}

// DELETE /api/qualifications/[id] — owner/admin only
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  const qualification = await prisma.staffQualification.findUnique({
    where: { id },
  });

  if (!qualification) {
    return NextResponse.json(
      { error: "Qualification not found" },
      { status: 404 }
    );
  }

  await prisma.staffQualification.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "StaffQualification",
      entityId: id,
      details: { name: qualification.name },
    },
  });

  return NextResponse.json({ success: true });
}
