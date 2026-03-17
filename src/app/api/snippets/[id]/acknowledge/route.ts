import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const userId = session!.user.id;

  // Verify snippet exists and is active
  const snippet = await prisma.infoSnippet.findFirst({
    where: { id, active: true },
  });

  if (!snippet) {
    return NextResponse.json(
      { error: "Snippet not found" },
      { status: 404 },
    );
  }

  const ack = await prisma.snippetAck.upsert({
    where: { snippetId_userId: { snippetId: id, userId } },
    create: { snippetId: id, userId },
    update: {},
  });

  return NextResponse.json(ack);
}
