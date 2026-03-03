import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/org-settings — fetch org settings (singleton)
export async function GET() {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  let settings = await prisma.orgSettings.findUnique({
    where: { id: "singleton" },
  });

  if (!settings) {
    settings = await prisma.orgSettings.create({
      data: { id: "singleton" },
    });
  }

  return NextResponse.json(settings);
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  primaryColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex colour")
    .optional(),
  accentColor: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/, "Invalid hex colour")
    .optional(),
});

// PATCH /api/org-settings — update org settings (owner only)
export async function PATCH(req: NextRequest) {
  const { error } = await requireAuth(["owner"]);
  if (error) return error;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const settings = await prisma.orgSettings.upsert({
    where: { id: "singleton" },
    update: parsed.data,
    create: { id: "singleton", ...parsed.data },
  });

  return NextResponse.json(settings);
}
