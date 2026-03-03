import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  platform: z
    .enum([
      "facebook",
      "instagram",
      "linkedin",
      "email",
      "newsletter",
      "website",
      "flyer",
    ])
    .optional(),
  pillar: z.string().optional().nullable(),
  content: z.string().min(1).optional(),
  notes: z.string().optional().nullable(),
  hashtags: z.string().optional().nullable(),
});

// GET /api/marketing/templates/:id — get a single template
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const template = await prisma.marketingTemplate.findUnique({
    where: { id },
  });

  if (!template || template.deleted) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(template);
}

// PATCH /api/marketing/templates/:id — update a template
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateTemplateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.marketingTemplate.findUnique({
    where: { id },
  });
  if (!existing || existing.deleted) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  const template = await prisma.marketingTemplate.update({
    where: { id },
    data: parsed.data,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MarketingTemplate",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(template);
}

// DELETE /api/marketing/templates/:id — soft delete a template
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.marketingTemplate.findUnique({
    where: { id },
  });
  if (!existing || existing.deleted) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 }
    );
  }

  await prisma.marketingTemplate.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "MarketingTemplate",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
