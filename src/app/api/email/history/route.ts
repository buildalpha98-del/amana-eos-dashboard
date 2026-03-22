import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = req.nextUrl;
  const entityType = searchParams.get("entityType");
  const entityId = searchParams.get("entityId");

  if (!entityType || !entityId) {
    return NextResponse.json(
      { error: "entityType and entityId are required" },
      { status: 400 },
    );
  }

  const logs = await prisma.deliveryLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      subject: true,
      status: true,
      recipientCount: true,
      createdAt: true,
    },
  });

  return NextResponse.json(logs);
});
