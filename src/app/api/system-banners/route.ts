import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const createBannerSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  type: z.enum(["info", "success", "warning", "feature", "celebration"]).optional().default("info"),
  linkUrl: z.string().optional(),
  linkLabel: z.string().optional(),
  startsAt: z.string().optional(),
  expiresAt: z.string().optional(),
  dismissible: z.boolean().optional().default(true),
});
// GET /api/system-banners — active, scheduled, non-expired, non-dismissed banners for current user
// ?all=true — returns all banners for admin management (owner/head_office only)
export const GET = withApiAuth(async (req, session) => {
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
});

// POST /api/system-banners — create a new banner (owner/head_office only)
export const POST = withApiAuth(async (req, session) => {
const raw = await req.json();
  const parsed = createBannerSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { title, body: bannerBody, type, linkUrl, linkLabel, startsAt, expiresAt, dismissible } = parsed.data;

  const banner = await prisma.systemBanner.create({
    data: {
      title: title.trim(),
      body: bannerBody.trim(),
      type,
      linkUrl: linkUrl || null,
      linkLabel: linkLabel || null,
      dismissible,
      createdById: session!.user.id,
      startsAt: startsAt ? new Date(startsAt) : null,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
    },
  });

  return NextResponse.json({ banner }, { status: 201 });
}, { roles: ["owner", "head_office"] });
