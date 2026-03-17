import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const templateInclude = {
  createdBy: { select: { id: true, name: true } },
} as const;

// POST /api/email-templates/:id/duplicate — clone a template
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth([
    "owner",
    "head_office",
    "admin",
  ]);
  if (error) return error;

  const { id } = await params;

  const source = await prisma.emailTemplate.findUnique({ where: { id } });
  if (!source) {
    return NextResponse.json(
      { error: "Template not found" },
      { status: 404 },
    );
  }

  const clone = await prisma.emailTemplate.create({
    data: {
      name: `${source.name} (Copy)`,
      category: source.category,
      subject: source.subject,
      htmlContent: source.htmlContent,
      blocks: source.blocks ?? undefined,
      isDefault: false,
      createdById: session!.user.id,
    },
    include: templateInclude,
  });

  return NextResponse.json(clone, { status: 201 });
}
