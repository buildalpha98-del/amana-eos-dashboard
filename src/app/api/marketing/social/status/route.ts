import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

export const GET = withApiAuth(async (req, session) => {
try {
    const connections = await prisma.socialConnection.findMany({
      select: {
        id: true,
        platform: true,
        status: true,
        accountId: true,
        accountName: true,
        lastSyncAt: true,
        lastSyncStatus: true,
        lastSyncError: true,
        serviceId: true,
        tokenExpiresAt: true,
        createdAt: true,
        updatedAt: true,
        service: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(connections);
  } catch (err) {
    logger.error("Social status error", { err });
    return NextResponse.json(
      { error: "Failed to fetch social connections" },
      { status: 500 }
    );
  }
}, { roles: ["owner", "head_office", "admin", "marketing"] });
