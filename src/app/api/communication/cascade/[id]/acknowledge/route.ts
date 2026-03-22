import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// POST /api/communication/cascade/[id]/acknowledge — acknowledge a cascade message
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

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
});
