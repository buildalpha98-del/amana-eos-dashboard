import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

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
    console.error("Social accounts error:", err);
    return NextResponse.json(
      { error: "Failed to fetch social accounts" },
      { status: 500 }
    );
  }
}
