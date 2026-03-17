import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  try {
    const body = await req.json();
    const { connectionId } = body as { connectionId?: string };

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId is required" },
        { status: 400 }
      );
    }

    // Verify the connection exists
    const connection = await prisma.socialConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    await prisma.socialConnection.delete({
      where: { id: connectionId },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Social disconnect error:", err);
    return NextResponse.json(
      { error: "Failed to disconnect social account" },
      { status: 500 }
    );
  }
}
