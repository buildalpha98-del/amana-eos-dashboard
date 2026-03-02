import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["owner", "admin", "member"]).optional(),
  active: z.boolean().optional(),
});

// PATCH /api/users/:id — update a user (owner only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const updated = await prisma.user.update({
    where: { id },
    data: parsed.data,
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "User",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(updated);
}
