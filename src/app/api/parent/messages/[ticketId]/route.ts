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

async function verifyTicketAccess(ticketId: string, email: string, enrolmentIds: string[]) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { id: true, parentContactId: true, deleted: true },
  });
  if (!ticket || ticket.deleted) throw ApiError.notFound("Conversation not found");

  const contactIds = await getParentContactIds(email, enrolmentIds);
  if (!ticket.parentContactId || !contactIds.includes(ticket.parentContactId)) {
    throw ApiError.forbidden("You do not have access to this conversation");
  }

  return ticket;
}

// ---------------------------------------------------------------------------
// GET — Get conversation thread
// ---------------------------------------------------------------------------

export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const ticketId = params?.ticketId;
  if (!ticketId) throw ApiError.badRequest("ticketId is required");

  await verifyTicketAccess(ticketId, ctx.parent.email, ctx.parent.enrolmentIds);

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      service: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          direction: true,
          senderName: true,
          body: true,
          mediaUrl: true,
          mediaType: true,
          createdAt: true,
        },
      },
    },
  });

  return NextResponse.json(ticket);
});

// ---------------------------------------------------------------------------
// POST — Send a reply message
// ---------------------------------------------------------------------------

const replySchema = z.object({
  message: z.string().min(1, "Message is required").max(5000),
});

export const POST = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const ticketId = params?.ticketId;
  if (!ticketId) throw ApiError.badRequest("ticketId is required");

  await verifyTicketAccess(ticketId, ctx.parent.email, ctx.parent.enrolmentIds);

  const body = await parseJsonBody(req);
  const parsed = replySchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid reply data", parsed.error.flatten().fieldErrors);
  }

  // Create inbound message + update ticket timestamps
  const [msg] = await prisma.$transaction([
    prisma.ticketMessage.create({
      data: {
        ticketId,
        direction: "inbound",
        senderName: ctx.parent.name,
        body: parsed.data.message,
        deliveryStatus: "delivered",
        deliveredAt: new Date(),
      },
    }),
    prisma.supportTicket.update({
      where: { id: ticketId },
      data: {
        lastInboundAt: new Date(),
        // Re-open if resolved/closed
        status: {
          set: "open",
        },
      },
    }),
  ]);

  return NextResponse.json(msg, { status: 201 });
});
