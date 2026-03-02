import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/tickets/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id, deleted: false },
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        include: {
          agent: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  return NextResponse.json(ticket);
}

// PATCH /api/tickets/[id]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  const existing = await prisma.supportTicket.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (body.subject !== undefined) data.subject = body.subject;
  if (body.priority !== undefined) data.priority = body.priority;
  if (body.assignedToId !== undefined) data.assignedToId = body.assignedToId || null;
  if (body.serviceId !== undefined) data.serviceId = body.serviceId || null;
  if (body.tags !== undefined) data.tags = body.tags;

  // Auto-set firstResponseAt when first assigned
  if (body.assignedToId && !existing.firstResponseAt) {
    data.firstResponseAt = new Date();
  }

  if (body.status !== undefined) {
    data.status = body.status;

    if (body.status === "resolved" && !existing.resolvedAt) {
      data.resolvedAt = new Date();
    }
    if (body.status === "closed" && !existing.closedAt) {
      data.closedAt = new Date();
    }
  }

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data,
    include: {
      contact: true,
      assignedTo: { select: { id: true, name: true, email: true, avatar: true } },
      service: { select: { id: true, name: true, code: true } },
      _count: {
        select: { messages: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "SupportTicket",
      entityId: ticket.id,
      details: { changes: Object.keys(data) },
    },
  });

  return NextResponse.json(ticket);
}

// DELETE /api/tickets/[id] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const ticket = await prisma.supportTicket.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "SupportTicket",
      entityId: ticket.id,
    },
  });

  return NextResponse.json({ success: true });
}
