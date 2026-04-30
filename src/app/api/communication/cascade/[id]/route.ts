import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const updateCascadeSchema = z.object({
  message: z.string().min(1, "Message is required"),
});

// GET /api/communication/cascade/[id] — single cascade message with acknowledgments
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const cascade = await prisma.cascadeMessage.findUnique({
    where: { id, deleted: false },
    include: {
      meeting: { select: { id: true, title: true, date: true } },
      acknowledgments: {
        include: {
          user: { select: { id: true, name: true } },
        },
        orderBy: { acknowledgedAt: "desc" },
      },
    },
  });

  if (!cascade) {
    return NextResponse.json(
      { error: "Cascade message not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(cascade);
});

// PATCH /api/communication/cascade/[id] — update message text
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = updateCascadeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.cascadeMessage.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Cascade message not found" },
      { status: 404 }
    );
  }

  const cascade = await prisma.cascadeMessage.update({
    where: { id },
    data: { message: parsed.data.message },
    include: {
      meeting: { select: { id: true, title: true, date: true } },
      _count: { select: { acknowledgments: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "CascadeMessage",
      entityId: cascade.id,
      details: { changes: ["message"] },
    },
  });

  return NextResponse.json(cascade);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/communication/cascade/[id] — soft delete
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const existing = await prisma.cascadeMessage.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Cascade message not found" },
      { status: 404 }
    );
  }

  const cascade = await prisma.cascadeMessage.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "CascadeMessage",
      entityId: cascade.id,
    },
  });

  return NextResponse.json({ success: true });
}, { roles: ["owner", "head_office", "admin"] });
