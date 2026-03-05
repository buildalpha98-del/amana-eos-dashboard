import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

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
    console.error("Social status error:", err);
    return NextResponse.json(
      { error: "Failed to fetch social connections" },
      { status: 500 }
    );
  }
}
