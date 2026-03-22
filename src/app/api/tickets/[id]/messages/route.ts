import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendTextMessage, isWithin24HourWindow } from "@/lib/whatsapp";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const createMessageSchema = z.object({
  body: z.string().min(1, "Message body is required"),
});

// GET /api/tickets/[id]/messages — list messages for a ticket
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "asc" },
    include: {
      agent: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(messages);
}, { roles: ["owner", "head_office", "admin"] });

// POST /api/tickets/[id]/messages — send a reply
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  const raw = await req.json();
  const parsed = createMessageSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const messageBody = parsed.data.body.trim();

  // Get the ticket with contact info
  const ticket = await prisma.supportTicket.findUnique({
    where: { id, deleted: false },
    include: { contact: true },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found" }, { status: 404 });
  }

  // Check 24-hour window
  if (!isWithin24HourWindow(ticket.lastInboundAt)) {
    return NextResponse.json(
      { error: "Cannot send message: 24-hour customer service window has expired. The customer must send a message first." },
      { status: 400 }
    );
  }

  // Send via WhatsApp API
  let waMessageId: string | null = null;
  try {
    const waResponse = await sendTextMessage(ticket.contact.waId, messageBody);
    waMessageId = waResponse?.messages?.[0]?.id || null;
  } catch (err) {
    logger.error("WhatsApp send failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send WhatsApp message" },
      { status: 502 }
    );
  }

  // Create outbound message record
  const message = await prisma.ticketMessage.create({
    data: {
      ticketId: id,
      waMessageId,
      direction: "outbound",
      senderName: session!.user.name,
      agentId: session!.user.id,
      body: messageBody,
    },
    include: {
      agent: { select: { id: true, name: true } },
    },
  });

  // Update ticket firstResponseAt if not set
  if (!ticket.firstResponseAt) {
    await prisma.supportTicket.update({
      where: { id },
      data: { firstResponseAt: new Date() },
    });
  }

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "reply",
      entityType: "SupportTicket",
      entityId: id,
      details: { messageId: message.id },
    },
  });

  return NextResponse.json(message, { status: 201 });
}, { roles: ["owner", "head_office", "admin"] });
