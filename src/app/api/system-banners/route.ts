import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/system-banners — active, non-expired, non-dismissed banners for current user
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const userId = session!.user.id;
  const now = new Date();

  const banners = await prisma.systemBanner.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      NOT: {
        dismissals: { some: { userId } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  return NextResponse.json({ banners });
}

// POST /api/system-banners — create a new banner (owner/head_office only)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office"]);
  if (error) return error;

  const body = await req.json();
  const { title, body: bannerBody, type, linkUrl, linkLabel, expiresAt } = body as {
    title?: string;
    body?: string;
    type?: string;
    linkUrl?: string;
    linkLabel?: string;
    expiresAt?: string;
  };

  if (!title || title.trim().length === 0) {
    return NextResponse.json({ error: "Title is required" }, { status: 400 });
  }

  if (!bannerBody || bannerBody.trim().length === 0) {
    return NextResponse.json({ error: "Body is required" }, { status: 400 });
  }

  const validTypes = ["info", "success", "warning", "feature"];
  if (type && !validTypes.includes(type)) {
    return NextResponse.json(
      { error: "Invalid type. Must be one of: info, success, warning, feature" },
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
      createdById: session!.user.id,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json({ banner }, { status: 201 });
}
