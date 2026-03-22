import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const POST = withApiAuth(async (req, session) => {
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
}, { roles: ["owner"] });
