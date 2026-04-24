import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendNewMessageNotification } from "@/lib/notifications/messaging";
import { logger } from "@/lib/logger";
import { attachmentUrlsField } from "@/lib/schemas/message-attachments";

const messageSchema = z
  .object({
    body: z.string().max(5000).default(""),
    attachmentUrls: attachmentUrlsField,
  })
  .refine((d) => d.body.trim().length > 0 || d.attachmentUrls.length > 0, {
    message: "Message body or attachments are required",
    path: ["body"],
  });

// ---------------------------------------------------------------------------
// POST — Staff sends a reply in a conversation
// ---------------------------------------------------------------------------

export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const raw = await parseJsonBody(req);
  const parsed = messageSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid message data", parsed.error.flatten().fieldErrors);
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!conversation) throw ApiError.notFound("Conversation not found");

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: id,
        body: parsed.data.body,
        attachmentUrls: parsed.data.attachmentUrls,
        senderType: "staff",
        senderId: session.user!.id!,
        senderName: session.user!.name ?? "Staff",
        isRead: true,
      },
    }),
    prisma.conversation.update({
      where: { id },
      data: { lastMessageAt: new Date() },
    }),
  ]);

  // Fire and forget notification
  sendNewMessageNotification(message.id).catch((err) => logger.error("Failed to send new message notification", { err, messageId: message.id }));

  return NextResponse.json(message, { status: 201 });
});
