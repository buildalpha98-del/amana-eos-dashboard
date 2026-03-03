import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { sendTextMessage, isWithin24HourWindow } from "@/lib/whatsapp";

// GET /api/tickets/[id]/messages — list messages for a ticket
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const messages = await prisma.ticketMessage.findMany({
    where: { ticketId: id },
    orderBy: { createdAt: "asc" },
    include: {
      agent: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(messages);
}

// POST /api/tickets/[id]/messages — send a reply
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();

  if (!body.body || typeof body.body !== "string" || body.body.trim() === "") {
    return NextResponse.json(
      { error: "Message body is required" },
      { status: 400 }
    );
  }

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
  const waResponse = await sendTextMessage(ticket.contact.waId, body.body.trim());
  const waMessageId = waResponse.messages?.[0]?.id || null;

  // Create outbound message record
  const message = await prisma.ticketMessage.create({
    data: {
      ticketId: id,
      waMessageId,
      direction: "outbound",
      senderName: session!.user.name,
      agentId: session!.user.id,
      body: body.body.trim(),
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
}
