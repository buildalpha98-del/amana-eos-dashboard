import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const updatePackSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
  isDefault: z.boolean().optional(),
});

// GET /api/offboarding/packs/[id] — get pack details with tasks & assignments
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const pack = await prisma.offboardingPack.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true, code: true } },
      tasks: { orderBy: { sortOrder: "asc" } },
      assignments: {
        include: {
          user: { select: { id: true, name: true, email: true, avatar: true } },
          progress: {
            include: {
              task: { select: { id: true, title: true } },
            },
          },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!pack || pack.deleted) {
    return NextResponse.json({ error: "Pack not found" }, { status: 404 });
  }

  return NextResponse.json(pack);
});

// PATCH /api/offboarding/packs/[id] — update pack
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = updatePackSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const pack = await prisma.offboardingPack.update({
    where: { id },
    data: parsed.data,
    include: {
      service: { select: { id: true, name: true, code: true } },
      tasks: { orderBy: { sortOrder: "asc" } },
      _count: { select: { tasks: true, assignments: true } },
    },
  });

  return NextResponse.json(pack);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/offboarding/packs/[id] — soft delete pack
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  await prisma.offboardingPack.update({
    where: { id },
    data: { deleted: true },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
