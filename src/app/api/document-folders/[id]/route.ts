import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { z } from "zod";

const updateFolderSchema = z.object({
  name: z.string().min(1).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateFolderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const folder = await prisma.documentFolder.update({
    where: { id },
    data: parsed.data,
    include: {
      _count: { select: { documents: true, children: true } },
    },
  });

  return NextResponse.json(folder);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  // Check if folder has documents or children
  const folder = await prisma.documentFolder.findUnique({
    where: { id },
    include: {
      _count: { select: { documents: true, children: true } },
    },
  });

  if (!folder) {
    return NextResponse.json({ error: "Folder not found" }, { status: 404 });
  }

  if (folder._count.documents > 0 || folder._count.children > 0) {
    return NextResponse.json(
      { error: "Folder must be empty before deleting. Move or remove all documents and subfolders first." },
      { status: 400 }
    );
  }

  await prisma.documentFolder.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
