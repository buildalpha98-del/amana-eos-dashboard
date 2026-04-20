import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getResend, FROM_EMAIL } from "@/lib/email";
import { ticketNotificationEmail } from "@/lib/email-templates";
import { notifyTicketAssigned, notifyTicketStatusChange } from "@/lib/teams-notify";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";
import { logger } from "@/lib/logger";

const patchTicketSchema = z.object({
  subject: z.string().min(1).optional(),
  priority: z.enum(["urgent", "high", "normal", "low"]).optional(),
  status: z.enum(["open", "in_progress", "waiting", "resolved", "closed"]).optional(),
  assignedToId: z.string().nullable().optional(),
  serviceId: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
});

// GET /api/tickets/[id]
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

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
}, { roles: ["owner", "head_office", "admin"] });

// PATCH /api/tickets/[id]
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const body = await req.json();
  const parsed = patchTicketSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { subject, priority, status, assignedToId, serviceId, tags } = parsed.data;

  const existing = await prisma.supportTicket.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};

  if (subject !== undefined) data.subject = subject;
  if (priority !== undefined) data.priority = priority;
  if (assignedToId !== undefined) data.assignedToId = assignedToId || null;
  if (serviceId !== undefined) data.serviceId = serviceId || null;
  if (tags !== undefined) data.tags = tags;

  // Auto-set firstResponseAt when first assigned
  if (assignedToId && !existing.firstResponseAt) {
    data.firstResponseAt = new Date();
  }

  if (status !== undefined) {
    data.status = status;

    if (status === "resolved" && !existing.resolvedAt) {
      data.resolvedAt = new Date();
    }
    if (status === "closed" && !existing.closedAt) {
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

  if (assignedToId && ticket.assignedTo) {
    const { subject: emailSubject, html } = ticketNotificationEmail(
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
        .send({ from: FROM_EMAIL, to: ticket.assignedTo.email, subject: emailSubject, html })
        .catch((err) => logger.error("Failed to send ticket notification", { err }));
    } else {
      if (process.env.NODE_ENV !== "production") console.log(`[DEV] Ticket notification for ${ticket.assignedTo.email}: ${ticket.subject}`);
    }

    // Teams notification (fire-and-forget)
    notifyTicketAssigned({
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      priority: ticket.priority,
      assignedTo: ticket.assignedTo.name,
      raisedBy: ticket.contact?.name || undefined,
      url: ticketUrl,
    }).catch((err) => logger.error("Failed to send Teams notification for ticket assigned", { err, ticketId: ticket.id }));
  }

  // Teams notification for status changes
  if (status !== undefined && status !== existing.status) {
    notifyTicketStatusChange({
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      newStatus: status,
      url: ticketUrl,
    }).catch((err) => logger.error("Failed to send Teams notification for ticket status change", { err, ticketId: ticket.id, newStatus: status }));
  }

  return NextResponse.json(ticket);
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/tickets/[id] — soft delete
export const DELETE = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

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
}, { roles: ["owner", "head_office", "admin"] });
