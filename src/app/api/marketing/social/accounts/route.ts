import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (req, session) => {
try {
    const accounts = await prisma.socialConnection.findMany({
      where: { status: "connected" },
      select: {
        id: true,
        platform: true,
        accountName: true,
        accountId: true,
        serviceId: true,
        status: true,
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(accounts);
  } catch (err) {
    logger.error("Social accounts error", { err });
    return NextResponse.json(
      { error: "Failed to fetch social accounts" },
      { status: 500 }
    );
  }
}, { roles: ["owner", "head_office", "admin", "marketing"] });
