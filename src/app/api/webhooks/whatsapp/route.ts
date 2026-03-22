import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyWebhookSignature } from "@/lib/whatsapp";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const WHATSAPP_VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN!;

// GET /api/webhooks/whatsapp — verify webhook (no auth required)
export const GET = withApiHandler(async (req) => {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN) {
    return new NextResponse(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
});

// POST /api/webhooks/whatsapp — receive messages & status updates (no auth, HMAC verified)
export const POST = withApiHandler(async (req) => {
  const rawBody = await req.text();
  const signature = req.headers.get("x-hub-signature-256") || "";

  if (!verifyWebhookSignature(signature, rawBody)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const payload = JSON.parse(rawBody);

  // Process asynchronously but return 200 immediately
  try {
    const entries = payload.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];

      for (const change of changes) {
        const value = change.value;

        // Handle inbound messages
        if (value.messages) {
          for (const message of value.messages) {
            await handleInboundMessage(value, message);
          }
        }

        // Handle status updates
        if (value.statuses) {
          for (const status of value.statuses) {
            await handleStatusUpdate(status);
          }
        }
      }
    }
  } catch (err) {
    logger.error("Webhook processing error", { err });
  }

  return NextResponse.json({ success: true }, { status: 200 });
});

async function handleInboundMessage(
  value: { contacts?: { wa_id: string; profile?: { name: string } }[] },
  message: { id: string; from: string; type: string; text?: { body: string }; timestamp: string }
) {
  const waId = message.from;
  const contactInfo = value.contacts?.find((c) => c.wa_id === waId);
  const profileName = contactInfo?.profile?.name || null;

  // Find or create contact
  let contact = await prisma.whatsAppContact.findUnique({
    where: { waId },
  });

  if (!contact) {
    contact = await prisma.whatsAppContact.create({
      data: {
        waId,
        phoneNumber: waId,
        name: profileName,
      },
    });
  }

  // Find open ticket for this contact or create a new one
  let ticket = await prisma.supportTicket.findFirst({
    where: {
      contactId: contact.id,
      deleted: false,
      status: { notIn: ["resolved", "closed"] },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();

  if (!ticket) {
    ticket = await prisma.supportTicket.create({
      data: {
        contactId: contact.id,
        serviceId: contact.serviceId || null,
        subject: message.text?.body?.substring(0, 100) || "New conversation",
        status: "new",
        lastInboundAt: now,
      },
    });
  } else {
    // Update ticket: set status to open if it was new, update lastInboundAt
    const updateData: Record<string, unknown> = { lastInboundAt: now };
    if (ticket.status === "new") {
      updateData.status = "open";
    }
    ticket = await prisma.supportTicket.update({
      where: { id: ticket.id },
      data: updateData,
    });
  }

  // Create the inbound message
  await prisma.ticketMessage.create({
    data: {
      ticketId: ticket.id,
      waMessageId: message.id,
      direction: "inbound",
      senderName: profileName || waId,
      body: message.text?.body || `[${message.type}]`,
      mediaUrl: null,
      mediaType: message.type !== "text" ? message.type : null,
    },
  });
}

async function handleStatusUpdate(status: {
  id: string;
  status: string;
  timestamp: string;
}) {
  const waMessageId = status.id;

  const message = await prisma.ticketMessage.findUnique({
    where: { waMessageId },
  });

  if (!message) return;

  const updateData: Record<string, unknown> = {};

  if (status.status === "delivered") {
    updateData.deliveryStatus = "delivered";
    updateData.deliveredAt = new Date(parseInt(status.timestamp) * 1000);
  } else if (status.status === "read") {
    updateData.deliveryStatus = "read";
    updateData.readAt = new Date(parseInt(status.timestamp) * 1000);
  } else if (status.status === "failed") {
    updateData.deliveryStatus = "failed";
  }

  if (Object.keys(updateData).length > 0) {
    await prisma.ticketMessage.update({
      where: { waMessageId },
      data: updateData,
    });
  }
}
