import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createContactSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().min(1, "Phone is required"),
  relationship: z.string().min(1, "Relationship is required"),
  isPrimary: z.boolean().default(false),
});

// POST /api/users/[id]/emergency-contacts
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const isAdmin = ["owner", "admin"].includes(session!.user.role);
  const isSelf = session!.user.id === id;

  if (!isAdmin && !isSelf) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const body = await parseJsonBody(req);
  const parsed = createContactSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // If new contact is primary, unset existing primary
  if (parsed.data.isPrimary) {
    await prisma.emergencyContact.updateMany({
      where: { userId: id, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const contact = await prisma.emergencyContact.create({
    data: {
      userId: id,
      name: parsed.data.name,
      phone: parsed.data.phone,
      relationship: parsed.data.relationship,
      isPrimary: parsed.data.isPrimary,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "EmergencyContact",
      entityId: contact.id,
      details: { name: contact.name, forUserId: id },
    },
  });

  return NextResponse.json(contact, { status: 201 });
});
