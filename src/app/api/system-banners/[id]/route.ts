import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const patchBannerSchema = z.object({
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  type: z.enum(["info", "success", "warning", "feature", "celebration"]).optional(),
  linkUrl: z.string().nullable().optional(),
  linkLabel: z.string().nullable().optional(),
  active: z.boolean().optional(),
  dismissible: z.boolean().optional(),
  startsAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
});

// PATCH /api/system-banners/[id] — update a banner (owner/head_office only)
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = patchBannerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }

  const existing = await prisma.systemBanner.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Banner not found" }, { status: 404 });
  }

  const {
    title,
    body: bannerBody,
    type,
    linkUrl,
    linkLabel,
    active,
    dismissible,
    startsAt,
    expiresAt,
  } = parsed.data;

  const banner = await prisma.systemBanner.update({
    where: { id },
    data: {
      ...(title !== undefined && { title: title.trim() }),
      ...(bannerBody !== undefined && { body: bannerBody.trim() }),
      ...(type !== undefined && { type }),
      ...(linkUrl !== undefined && { linkUrl: linkUrl || null }),
      ...(linkLabel !== undefined && { linkLabel: linkLabel || null }),
      ...(active !== undefined && { active }),
      ...(dismissible !== undefined && { dismissible }),
      ...(startsAt !== undefined && { startsAt: startsAt ? new Date(startsAt) : null }),
      ...(expiresAt !== undefined && { expiresAt: expiresAt ? new Date(expiresAt) : null }),
    },
  });

  // Suppress unused variable warning
  void session;

  return NextResponse.json({ banner });
}, { roles: ["owner", "head_office"] });

// DELETE /api/system-banners/[id] — delete a banner (owner/head_office only)
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const existing = await prisma.systemBanner.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Banner not found" }, { status: 404 });
  }

  await prisma.systemBanner.delete({ where: { id } });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office"] });
