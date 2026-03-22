import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
const updateContactSchema = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(1).optional(),
  relationship: z.string().min(1).optional(),
  isPrimary: z.boolean().optional(),
});

// PATCH /api/emergency-contacts/[id]
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const contact = await prisma.emergencyContact.findUnique({
    where: { id },
  });

  if (!contact) {
    return NextResponse.json(
      { error: "Emergency contact not found" },
      { status: 404 }
    );
  }

  const isAdmin = ["owner", "admin"].includes(session!.user.role);
  const isSelf = session!.user.id === contact.userId;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateContactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // If setting as primary, unset existing primary
  if (parsed.data.isPrimary) {
    await prisma.emergencyContact.updateMany({
      where: { userId: contact.userId, isPrimary: true, NOT: { id } },
      data: { isPrimary: false },
    });
  }

  const updated = await prisma.emergencyContact.update({
    where: { id },
    data: parsed.data,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "EmergencyContact",
      entityId: id,
      details: { fields: Object.keys(parsed.data) },
    },
  });

  return NextResponse.json(updated);
});

// DELETE /api/emergency-contacts/[id]
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const contact = await prisma.emergencyContact.findUnique({
    where: { id },
  });

  if (!contact) {
    return NextResponse.json(
      { error: "Emergency contact not found" },
      { status: 404 }
    );
  }

  const isAdmin = ["owner", "admin"].includes(session!.user.role);
  const isSelf = session!.user.id === contact.userId;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await prisma.emergencyContact.delete({ where: { id } });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "EmergencyContact",
      entityId: id,
      details: { name: contact.name },
    },
  });

  return NextResponse.json({ success: true });
});
