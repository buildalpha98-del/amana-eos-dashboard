import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendNewMessageNotification } from "@/lib/notifications/messaging";
import { logger } from "@/lib/logger";
import { attachmentUrlsField } from "@/lib/schemas/message-attachments";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getParentContactIds(
  email: string,
  enrolmentIds: string[],
): Promise<string[]> {
  if (enrolmentIds.length === 0) return [];

  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [
    ...new Set(enrolments.map((e) => e.serviceId).filter(Boolean)),
  ] as string[];
  if (serviceIds.length === 0) return [];

  const contacts = await prisma.centreContact.findMany({
    where: { email: email.toLowerCase(), serviceId: { in: serviceIds } },
    select: { id: true, serviceId: true },
  });
  return contacts.map((c) => c.id);
}

// ---------------------------------------------------------------------------
// GET — List parent's conversations
// ---------------------------------------------------------------------------

export const GET = withParentAuth(async (_req, { parent }) => {
  const contactIds = await getParentContactIds(parent.email, parent.enrolmentIds);
  if (contactIds.length === 0) {
    return NextResponse.json([]);
  }

  const conversations = await prisma.conversation.findMany({
    where: { familyId: { in: contactIds } },
    orderBy: { lastMessageAt: "desc" },
    include: {
      service: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          body: true,
          senderType: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          messages: { where: { senderType: "staff", isRead: false } },
        },
      },
    },
  });

  const result = conversations.map((c) => {
    const lastMsg = c.messages[0];
    return {
      id: c.id,
      subject: c.subject,
      status: c.status,
      service: c.service,
      lastMessage: lastMsg
        ? {
            preview: lastMsg.body.slice(0, 100),
            senderType: lastMsg.senderType,
            createdAt: lastMsg.createdAt,
          }
        : null,
      unreadCount: c._count.messages,
      createdAt: c.createdAt,
      lastMessageAt: c.lastMessageAt,
    };
  });

  return NextResponse.json(result);
});

// ---------------------------------------------------------------------------
// POST — Create a new conversation with first message
// ---------------------------------------------------------------------------

const createConversationSchema = z
  .object({
    subject: z.string().min(1, "Subject is required").max(200),
    message: z.string().max(5000).default(""),
    serviceId: z.string().optional(),
    attachmentUrls: attachmentUrlsField,
  })
  .refine((d) => d.message.trim().length > 0 || d.attachmentUrls.length > 0, {
    message: "Message or attachments are required",
    path: ["message"],
  });

export const POST = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = createConversationSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid message data",
      parsed.error.flatten().fieldErrors,
    );
  }

  const { subject, message, serviceId, attachmentUrls } = parsed.data;

  // Resolve parent's CentreContact(s)
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [
    ...new Set(enrolments.map((e) => e.serviceId).filter(Boolean)),
  ] as string[];

  // Pick the right service
  const resolvedServiceId = serviceId ?? serviceIds[0];
  if (!resolvedServiceId) {
    throw ApiError.badRequest(
      "No service found. Please contact the centre.",
    );
  }

  // Find the CentreContact for this parent + service
  const contact = await prisma.centreContact.findFirst({
    where: {
      email: parent.email.toLowerCase(),
      serviceId: resolvedServiceId,
    },
    select: { id: true, firstName: true, lastName: true },
  });

  if (!contact) {
    throw ApiError.badRequest(
      "No contact record found. Please contact the centre.",
    );
  }

  const senderName = [contact.firstName, contact.lastName]
    .filter(Boolean)
    .join(" ") || parent.name;

  const conversation = await prisma.conversation.create({
    data: {
      serviceId: resolvedServiceId,
      familyId: contact.id,
      subject,
      lastMessageAt: new Date(),
      messages: {
        create: {
          body: message,
          attachmentUrls,
          senderType: "parent",
          senderId: contact.id,
          senderName,
        },
      },
    },
    include: {
      service: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Fire and forget notification to coordinator
  const firstMessage = conversation.messages[0];
  if (firstMessage) {
    sendNewMessageNotification(firstMessage.id).catch((err) => logger.error("Failed to send new message notification", { err, messageId: firstMessage.id }));
  }

  return NextResponse.json(conversation, { status: 201 });
});
