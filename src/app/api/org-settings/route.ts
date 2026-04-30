import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
// GET /api/org-settings — fetch org settings (singleton)
export const GET = withApiAuth(async (req, session) => {
  let settings = await prisma.orgSettings.findUnique({
    where: { id: "singleton" },
  });

  if (!settings) {
    settings = await prisma.orgSettings.create({
      data: { id: "singleton" },
    });
  }

  return NextResponse.json(settings);
}, { roles: ["owner", "head_office", "admin"] });

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
  purchaseBudgetTiers: z.array(z.object({
    minWeeklyChildren: z.number().min(0),
    monthlyBudget: z.number().min(0),
  })).optional(),
});

// PATCH /api/org-settings — update org settings (owner only)
export const PATCH = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
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
}, { roles: ["owner", "head_office"] });
