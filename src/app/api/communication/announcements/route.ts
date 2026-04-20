import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getServiceScope, getStateScope } from "@/lib/service-scope";
import { withApiAuth } from "@/lib/server-auth";

import { parseJsonBody } from "@/lib/api-error";
const createAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required"),
  body: z.string().min(1, "Body is required"),
  audience: z.enum(["all", "owners_admins", "managers", "custom"]).default("all"),
  priority: z.enum(["normal", "important", "urgent"]).default("normal"),
  pinned: z.boolean().optional().default(false),
  serviceId: z.string().optional().nullable(),
  publishedAt: z.string().datetime().optional().nullable(),
});

// GET /api/communication/announcements — list announcements
export const GET = withApiAuth(async (req, session) => {
const { searchParams } = new URL(req.url);
  const audience = searchParams.get("audience");
  const serviceId = searchParams.get("serviceId");
  const drafts = searchParams.get("drafts");

  const isPrivileged = ["owner", "admin"].includes(session!.user.role);

  const where: Record<string, unknown> = { deleted: false };

  if (audience) where.audience = audience;
  if (serviceId) where.serviceId = serviceId;

  // Published announcements are always visible.
  // Drafts (publishedAt is null) only visible to owner/admin when drafts=true.
  if (drafts === "true" && isPrivileged) {
    // Show both published and drafts — no publishedAt filter
  } else {
    where.publishedAt = { not: null };
  }

  // Member/staff: only see announcements for their service or company-wide (serviceId = null)
  const scope = getServiceScope(session);
  const stateScope = getStateScope(session);
  if (scope) {
    where.OR = [
      { serviceId: scope },
      { serviceId: null },
    ];
  }

  // State Manager: only see announcements for services in their state or company-wide
  if (stateScope) {
    where.OR = [
      { service: { state: stateScope } },
      { serviceId: null },
    ];
  }

  const announcements = await prisma.announcement.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      service: { select: { id: true, name: true } },
      _count: {
        select: { readReceipts: true },
      },
    },
    orderBy: [{ pinned: "desc" }, { publishedAt: "desc" }],
  });

  return NextResponse.json(announcements);
});

// POST /api/communication/announcements — create announcement
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createAnnouncementSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const announcement = await prisma.announcement.create({
    data: {
      title: parsed.data.title,
      body: parsed.data.body,
      audience: parsed.data.audience,
      priority: parsed.data.priority,
      pinned: parsed.data.pinned ?? false,
      serviceId: parsed.data.serviceId || null,
      publishedAt: parsed.data.publishedAt
        ? new Date(parsed.data.publishedAt)
        : null,
      authorId: session!.user.id,
    },
    include: {
      author: { select: { id: true, name: true, avatar: true } },
      service: { select: { id: true, name: true } },
      _count: {
        select: { readReceipts: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Announcement",
      entityId: announcement.id,
      details: { title: announcement.title, audience: announcement.audience },
    },
  });

  return NextResponse.json(announcement, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
