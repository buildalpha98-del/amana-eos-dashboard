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

/**
 * The centres this parent belongs to: each submitted enrolment's centre,
 * plus any centre staff have since assigned to the children. The second half
 * matters for an enrolment whose school didn't resolve at submit — staff fix
 * it on the CHILD, and the family would otherwise stay unable to message.
 */
async function getParentServiceIds(enrolmentIds: string[]): Promise<string[]> {
  if (enrolmentIds.length === 0) return [];
  const [enrolments, children] = await Promise.all([
    prisma.enrolmentSubmission.findMany({
      where: { id: { in: enrolmentIds }, status: { not: "draft" } },
      select: { serviceId: true },
    }),
    prisma.child.findMany({
      where: { enrolmentId: { in: enrolmentIds }, serviceId: { not: null } },
      select: { serviceId: true },
    }),
  ]);
  return [
    ...new Set(
      [...enrolments, ...children].map((r) => r.serviceId).filter(Boolean),
    ),
  ] as string[];
}

async function getParentContactIds(
  email: string,
  enrolmentIds: string[],
): Promise<string[]> {
  const serviceIds = await getParentServiceIds(enrolmentIds);
  if (serviceIds.length === 0) return [];

  const contacts = await prisma.centreContact.findMany({
    where: { email: email.toLowerCase(), serviceId: { in: serviceIds } },
    select: { id: true, serviceId: true },
  });
  return contacts.map((c) => c.id);
}

/**
 * The family's CentreContact at this centre, creating it if needed.
 *
 * Nothing created one when a family enrolled through the portal, so the
 * first message from a newly enrolled parent failed with "No contact record
 * found" — the families most likely to need help were the ones who couldn't
 * ask. Seeded from the enrolment's primary carer; unique on (email,
 * serviceId), so a concurrent sync or approval can't duplicate it.
 */
async function ensureParentContact(
  email: string,
  serviceId: string,
  enrolmentIds: string[],
  fallbackName: string | undefined,
) {
  const normalised = email.toLowerCase();
  const existing = await prisma.centreContact.findFirst({
    where: { email: normalised, serviceId },
    select: { id: true, firstName: true, lastName: true },
  });
  if (existing) return existing;

  const source = await prisma.enrolmentSubmission.findFirst({
    where: { id: { in: enrolmentIds }, status: { not: "draft" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, primaryParent: true },
  });
  const pp = (source?.primaryParent ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const [fallbackFirst, ...fallbackRest] = (fallbackName ?? "").trim().split(/\s+/);

  return prisma.centreContact.upsert({
    where: { email_serviceId: { email: normalised, serviceId } },
    update: {},
    create: {
      email: normalised,
      serviceId,
      firstName: str(pp.firstName) ?? (fallbackFirst || null),
      lastName: str(pp.surname) ?? (fallbackRest.join(" ") || null),
      mobile: str(pp.mobile),
      parentRole: "primary",
      sourceEnrolmentId: source?.id ?? null,
    },
    select: { id: true, firstName: true, lastName: true },
  });
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

  const serviceIds = await getParentServiceIds(parent.enrolmentIds);

  // A requested centre must be one of the family's own. Accepting any id
  // let a parent open a conversation with a centre they have no tie to.
  if (serviceId && !serviceIds.includes(serviceId)) {
    throw ApiError.forbidden("You can only message your own centre.");
  }
  const resolvedServiceId = serviceId ?? serviceIds[0];
  if (!resolvedServiceId) {
    throw ApiError.badRequest(
      "We're still matching your enrolment to a centre. Please email enrolments@amanaoshc.com.au and we'll help straight away.",
    );
  }

  const contact = await ensureParentContact(
    parent.email,
    resolvedServiceId,
    parent.enrolmentIds,
    parent.name,
  );

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
