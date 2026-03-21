import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/system-banners — active, scheduled, non-expired, non-dismissed banners for current user
// ?all=true — returns all banners for admin management (owner/head_office only)
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const userId = session!.user.id;
  const showAll = req.nextUrl.searchParams.get("all") === "true";

  // Admin view: return all banners for management
  if (showAll) {
    const role = (session!.user as Record<string, unknown>).role as string;
    if (!["owner", "head_office"].includes(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const banners = await prisma.systemBanner.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        _count: { select: { dismissals: true } },
      },
    });

    return NextResponse.json({ banners });
  }

  // User view: active, within schedule window, not dismissed
  const now = new Date();

  const banners = await prisma.systemBanner.findMany({
    where: {
      active: true,
      OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
      NOT: {
        dismissals: { some: { userId } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 5,
  });

  return NextResponse.json({ banners });
}

// POST /api/system-banners — create a new banner (owner/head_office only)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office"]);
  if (error) return error;

  const body = await req.json();
  const {
    title,
    body: bannerBody,
    type,
    linkUrl,
    linkLabel,
    startsAt,
    expiresAt,
    dismissible,
  } = body as {
    title?: string;
    body?: string;
    type?: string;
    linkUrl?: string;
    linkLabel?: string;
    startsAt?: string;
    expiresAt?: string;
    dismissible?: boolean;
  };

  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (!bannerBody || bannerBody.trim().length === 0) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }

  const validTypes = ["info", "success", "warning", "feature", "celebration"];
  if (type && !validTypes.includes(type)) {
    return NextResponse.json(
      { error: "Invalid type. Must be one of: info, success, warning, feature, celebration" },
      { status: 400 },
    );
  }

  const banner = await prisma.systemBanner.create({
    data: {
      title: title.trim(),
      body: bannerBody.trim(),
      type: type || "info",
      linkUrl: linkUrl || null,
      linkLabel: linkLabel || null,
      dismissible: dismissible !== false,
      createdById: session!.user.id,
      startsAt: startsAt ? new Date(startsAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json({ banner }, { status: 201 });
}
