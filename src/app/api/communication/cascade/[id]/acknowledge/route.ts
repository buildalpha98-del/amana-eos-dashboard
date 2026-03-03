import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// POST /api/communication/cascade/[id]/acknowledge — acknowledge a cascade message
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const cascade = await prisma.cascadeMessage.findUnique({
    where: { id, deleted: false },
  });

  if (!cascade) {
    return NextResponse.json(
      { error: "Cascade message not found" },
      { status: 404 }
    );
  }

  const acknowledgment = await prisma.cascadeAcknowledgment.upsert({
    where: {
      cascadeMessageId_userId: {
        cascadeMessageId: id,
        userId: session!.user.id,
      },
    },
    update: {},
    create: {
      cascadeMessageId: id,
      userId: session!.user.id,
    },
  });

  return NextResponse.json(acknowledgment);
}
