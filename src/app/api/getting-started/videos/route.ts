import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/getting-started/videos — return role video URLs from OrgSettings
export async function GET() {
  const { error } = await requireAuth();
  if (error) return error;

  const settings = await prisma.orgSettings.findUnique({
    where: { id: "singleton" },
    select: { roleVideos: true },
  });

  return NextResponse.json({
    roleVideos: (settings?.roleVideos as Record<string, string>) ?? {},
  });
}

const updateSchema = z.object({
  roleVideos: z.record(
    z.enum([
      "staff",
      "member",
      "coordinator",
      "admin",
      "head_office",
      "owner",
      "marketing",
    ]),
    z.string().url().or(z.literal("")),
  ),
});

// PUT /api/getting-started/videos — update role video URLs (admin+ only)
export async function PUT(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Merge with existing so partial updates work
  const existing = await prisma.orgSettings.findUnique({
    where: { id: "singleton" },
    select: { roleVideos: true },
  });

  const current = (existing?.roleVideos as Record<string, string>) ?? {};
  const merged: Record<string, string> = { ...current, ...parsed.data.roleVideos };

  // Remove empty strings (clearing a video)
  for (const [key, val] of Object.entries(merged)) {
    if (!val) delete merged[key];
  }

  const settings = await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    update: { roleVideos: merged },
    create: { id: "singleton", roleVideos: merged },
  });

  return NextResponse.json({
    roleVideos: (settings.roleVideos as Record<string, string>) ?? {},
  });
}
