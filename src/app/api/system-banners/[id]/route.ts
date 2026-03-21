import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// PATCH /api/system-banners/[id] — update a banner (owner/head_office only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth(["owner", "head_office"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

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
  } = body as {
    title?: string;
    body?: string;
    type?: string;
    linkUrl?: string | null;
    linkLabel?: string | null;
    active?: boolean;
    dismissible?: boolean;
    startsAt?: string | null;
    expiresAt?: string | null;
  };

  const validTypes = ["info", "success", "warning", "feature", "celebration"];
  if (type && !validTypes.includes(type)) {
    return NextResponse.json(
      { error: "Invalid type. Must be one of: info, success, warning, feature, celebration" },
      { status: 400 },
    );
  }

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
}

// DELETE /api/system-banners/[id] — delete a banner (owner/head_office only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { error } = await requireAuth(["owner", "head_office"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.systemBanner.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Banner not found" }, { status: 404 });
  }

  await prisma.systemBanner.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
