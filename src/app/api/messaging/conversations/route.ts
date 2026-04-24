import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendNewMessageNotification } from "@/lib/notifications/messaging";
import { logger } from "@/lib/logger";
import { attachmentUrlsField } from "@/lib/schemas/message-attachments";

// ---------------------------------------------------------------------------
// GET — List conversations
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (req: NextRequest) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? undefined;
  const status = url.searchParams.get("status") ?? "open";
  const search = url.searchParams.get("search") ?? undefined;

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;
  if (status) where.status = status;
  if (search) {
    where.OR = [
      { subject: { contains: search, mode: "insensitive" } },
      {
        family: {
          OR: [
            { firstName: { contains: search, mode: "insensitive" } },
            { lastName: { contains: search, mode: "insensitive" } },
          ],
        },
      },
    ];
  }

  const conversations = await prisma.conversation.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    include: {
      family: { select: { id: true, firstName: true, lastName: true } },
      service: { select: { id: true, name: true } },
      messages: {
        where: { senderType: "parent", isRead: false },
        select: { id: true },
      },
    },
  });

  const result = conversations.map((c) => ({
    id: c.id,
    subject: c.subject,
    status: c.status,
    lastMessageAt: c.lastMessageAt,
    family: c.family,
    service: c.service,
    unreadCount: c.messages.length,
  }));

  return NextResponse.json(result);
});

// ---------------------------------------------------------------------------
// POST — Create a new conversation with first message
// ---------------------------------------------------------------------------

const createSchema = z
  .object({
    familyId: z.string().min(1, "familyId is required"),
    serviceId: z.string().min(1, "serviceId is required"),
    subject: z.string().min(1, "Subject is required").max(200),
    body: z.string().max(5000).default(""),
    attachmentUrls: attachmentUrlsField,
  })
  .refine((d) => d.body.trim().length > 0 || d.attachmentUrls.length > 0, {
    message: "Message body or attachments are required",
    path: ["body"],
  });

export const POST = withApiAuth(async (req: NextRequest, session) => {
  const raw = await parseJsonBody(req);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid conversation data", parsed.error.flatten().fieldErrors);
  }

  const { familyId, serviceId, subject, body, attachmentUrls } = parsed.data;

  // Verify family and service exist
  const [family, service] = await Promise.all([
    prisma.centreContact.findUnique({ where: { id: familyId }, select: { id: true } }),
    prisma.service.findUnique({ where: { id: serviceId }, select: { id: true } }),
  ]);

  if (!family) throw ApiError.notFound("Family not found");
  if (!service) throw ApiError.notFound("Service not found");

  const conversation = await prisma.conversation.create({
    data: {
      serviceId,
      familyId,
      subject,
      lastMessageAt: new Date(),
      messages: {
        create: {
          body,
          attachmentUrls,
          senderType: "staff",
          senderId: session.user!.id!,
          senderName: session.user!.name ?? "Staff",
          isRead: true, // Staff's own message is "read"
        },
      },
    },
    include: {
      family: { select: { id: true, firstName: true, lastName: true } },
      service: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  // Fire and forget notification
  const firstMessage = conversation.messages[0];
  if (firstMessage) {
    sendNewMessageNotification(firstMessage.id).catch((err) => logger.error("Failed to send new message notification", { err, messageId: firstMessage.id }));
  }

  return NextResponse.json(conversation, { status: 201 });
});
