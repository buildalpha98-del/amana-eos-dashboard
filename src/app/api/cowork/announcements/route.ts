import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork, setVersionHeaders } from "../../_lib/auth";
import { announcementSchema } from "../../_lib/validation";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

// POST /api/cowork/announcements — Create an announcement
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = announcementSchema.safeParse(body);

    if (!parsed.success) {
      return setVersionHeaders(
        NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 }),
        1,
        { deprecated: true },
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

    return setVersionHeaders(
      NextResponse.json(announcement, { status: 201 }),
      1,
      { deprecated: true },
    );
  } catch (err) {
    logger.error("Cowork Announcements POST", { err });
    return setVersionHeaders(
      NextResponse.json({ error: "Internal server error" }, { status: 500 }),
      1,
      { deprecated: true },
    );
  }
});

// GET /api/cowork/announcements — Retrieve announcements
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
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

    const res = setVersionHeaders(
      NextResponse.json({ announcements }),
      1,
      { deprecated: true },
    );
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res;
  } catch (err) {
    logger.error("Cowork Announcements GET", { err });
    return setVersionHeaders(
      NextResponse.json({ error: "Internal server error" }, { status: 500 }),
      1,
      { deprecated: true },
    );
  }
});
