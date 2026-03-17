import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth([
    "owner",
    "head_office",
    "admin",
  ]);
  if (error) return error;

  const { id } = await params;

  const snippet = await prisma.infoSnippet.findUnique({ where: { id } });
  if (!snippet) {
    return NextResponse.json(
      { error: "Snippet not found" },
      { status: 404 },
    );
  }

  await prisma.infoSnippet.update({
    where: { id },
    data: { active: false },
  });

  return NextResponse.json({ ok: true });
}
