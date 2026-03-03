import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { ticketNotificationEmail } from "@/lib/email-templates";
import { notifyTicketAssigned, notifyTicketStatusChange } from "@/lib/teams-notify";

// GET /api/tickets/[id]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
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
  const { session, error } = await requireAuth(["owner", "admin"]);
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

  // Send notification email when ticket is assigned to someone new
  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const ticketUrl = `${baseUrl}/tickets?id=${ticket.id}`;

  if (body.assignedToId && ticket.assignedTo) {
    const { subject, html } = ticketNotificationEmail(
      ticket.assignedTo.name.split(" ")[0],
      {
        title: ticket.subject || `Ticket #${ticket.ticketNumber}`,
        priority: ticket.priority,
        raisedBy: ticket.contact?.name || undefined,
      },
      ticketUrl
    );

    const resend = getResend();
    if (resend) {
      resend.emails
        .send({ from: FROM_EMAIL, to: ticket.assignedTo.email, subject, html })
        .catch((err: unknown) => console.error("Failed to send ticket notification:", err));
    } else {
      console.log(`[DEV] Ticket notification for ${ticket.assignedTo.email}: ${ticket.subject}`);
    }

    // Teams notification (fire-and-forget)
    notifyTicketAssigned({
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      priority: ticket.priority,
      assignedTo: ticket.assignedTo.name,
      raisedBy: ticket.contact?.name || undefined,
      url: ticketUrl,
    }).catch(() => {});
  }

  // Teams notification for status changes
  if (body.status !== undefined && body.status !== existing.status) {
    notifyTicketStatusChange({
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      newStatus: body.status,
      url: ticketUrl,
    }).catch(() => {});
  }

  return NextResponse.json(ticket);
}

// DELETE /api/tickets/[id] — soft delete
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
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
