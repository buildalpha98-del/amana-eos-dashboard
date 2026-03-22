import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const postSchema = z.object({
  connectionId: z.string().min(1),
});

export const POST = withApiAuth(async (req, session) => {
try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { connectionId } = parsed.data;

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
    logger.error("Social disconnect error", { err });
    return NextResponse.json(
      { error: "Failed to disconnect social account" },
      { status: 500 }
    );
  }
}, { roles: ["owner", "head_office", "admin", "marketing"] });
