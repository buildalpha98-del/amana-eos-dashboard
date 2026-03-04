import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["owner", "admin", "member", "staff"]).optional(),
  active: z.boolean().optional(),
  newPassword: z.string().min(8, "Password must be at least 8 characters").optional(),
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

  // Build update payload — handle password separately
  const { newPassword, ...rest } = parsed.data;
  const updateData: Record<string, unknown> = { ...rest };
  if (newPassword) {
    updateData.passwordHash = await hash(newPassword, 12);
  }

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
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
      action: newPassword ? "reset_password" : "update",
      entityType: "User",
      entityId: id,
      details: { ...rest, passwordReset: !!newPassword },
    },
  });

  return NextResponse.json(updated);
}
