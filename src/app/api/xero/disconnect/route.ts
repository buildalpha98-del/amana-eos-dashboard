import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  await prisma.xeroConnection.update({
    where: { id: "singleton" },
    data: {
      status: "disconnected",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      tenantId: null,
      tenantName: null,
    },
  });

  return NextResponse.json({ success: true });
}
