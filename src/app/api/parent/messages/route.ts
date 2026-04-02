import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getParentContactIds(email: string, enrolmentIds: string[]): Promise<string[]> {
  if (enrolmentIds.length === 0) return [];

  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter(Boolean))] as string[];
  if (serviceIds.length === 0) return [];

  const contacts = await prisma.centreContact.findMany({
    where: { email: email.toLowerCase(), serviceId: { in: serviceIds } },
    select: { id: true },
  });
  return contacts.map((c) => c.id);
}

/**
 * Find or create a WhatsAppContact for portal-originated tickets.
 * Uses a synthetic waId based on email to satisfy the FK constraint.
 */
async function getOrCreatePortalContact(email: string, name: string, serviceId?: string) {
  const portalWaId = `portal:${email.toLowerCase()}`;

  let contact = await prisma.whatsAppContact.findUnique({
    where: { waId: portalWaId },
  });

  if (!contact) {
    contact = await prisma.whatsAppContact.create({
      data: {
        waId: portalWaId,
        phoneNumber: "portal",
        parentName: name,
        name: name,
        serviceId: serviceId ?? undefined,
      },
    });
  }

  return contact;
}

// ---------------------------------------------------------------------------
// GET — List parent's conversations (support tickets)
// ---------------------------------------------------------------------------

export const GET = withParentAuth(async (_req, { parent }) => {
  const contactIds = await getParentContactIds(parent.email, parent.enrolmentIds);
  if (contactIds.length === 0) {
    return NextResponse.json([]);
  }

  const tickets = await prisma.supportTicket.findMany({
    where: {
      parentContactId: { in: contactIds },
      deleted: false,
    },
    include: {
      service: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          direction: true,
          createdAt: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const conversations = tickets.map((t) => {
    const lastMsg = t.messages[0];
    return {
      id: t.id,
      ticketNumber: t.ticketNumber,
      subject: t.subject,
      status: t.status,
      service: t.service,
      lastMessage: lastMsg
        ? {
            preview: lastMsg.body.slice(0, 100),
            direction: lastMsg.direction,
            createdAt: lastMsg.createdAt,
          }
        : null,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  });

  return NextResponse.json(conversations);
});

// ---------------------------------------------------------------------------
// POST — Create a new conversation (support ticket + first message)
// ---------------------------------------------------------------------------

const createConversationSchema = z.object({
  subject: z.string().min(1, "Subject is required").max(200),
  message: z.string().min(1, "Message is required").max(5000),
  serviceId: z.string().optional(),
});

export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid message data", parsed.error.flatten().fieldErrors);
  }

  const { subject, message, serviceId } = parsed.data;

  // Find parent's CentreContact
  const contactIds = await getParentContactIds(parent.email, parent.enrolmentIds);
  if (contactIds.length === 0) {
    throw ApiError.badRequest("No contact record found. Please contact the centre.");
  }

  // Determine service — use provided or first available
  let resolvedServiceId = serviceId;
  if (!resolvedServiceId) {
    const enrolments = await prisma.enrolmentSubmission.findMany({
      where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
      select: { serviceId: true },
    });
    resolvedServiceId = enrolments[0]?.serviceId ?? undefined;
  }

  // Get or create a WhatsAppContact for the portal FK constraint
  const waContact = await getOrCreatePortalContact(
    parent.email,
    parent.name,
    resolvedServiceId,
  );

  // Create ticket + first message atomically
  const ticket = await prisma.supportTicket.create({
    data: {
      contactId: waContact.id,
      parentContactId: contactIds[0],
      source: "portal",
      subject,
      status: "new",
      serviceId: resolvedServiceId,
      lastInboundAt: new Date(),
      messages: {
        create: {
          direction: "inbound",
          senderName: parent.name,
          body: message,
          deliveryStatus: "delivered",
          deliveredAt: new Date(),
        },
      },
    },
    include: {
      service: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          senderName: true,
          body: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json(ticket, { status: 201 });
});
