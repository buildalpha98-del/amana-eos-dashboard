import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "../../_lib/auth";
import { announcementSchema } from "../../_lib/validation";

// POST /api/cowork/announcements — Create an announcement
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = announcementSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    const { title, body: announcementBody, type, targetCentres, attachments, pinned, expiresAt } =
      parsed.data;

    const announcement = await prisma.coworkAnnouncement.create({
      data: {
        title,
        body: announcementBody,
        type,
        targetCentres,
        attachments,
        pinned,
        expiresAt: expiresAt ?? null,
      },
    });

    return NextResponse.json(announcement, { status: 201 });
  } catch (err) {
    console.error("[Cowork Announcements POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// GET /api/cowork/announcements — Retrieve announcements
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const { searchParams } = new URL(req.url);
    const centreId = searchParams.get("centreId");

    const now = new Date();

    const announcements = await prisma.coworkAnnouncement.findMany({
      where: {
        // Non-expired: expiresAt is null or in the future
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        // If centreId filter provided, match "all" or specific centre
        ...(centreId
          ? { targetCentres: { hasSome: ["all", centreId] } }
          : {}),
      },
      orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
      take: 20,
    });

    return NextResponse.json({ announcements });
  } catch (err) {
    console.error("[Cowork Announcements GET]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
