import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendNewMessageNotification } from "@/lib/notifications/messaging";
import { logger } from "@/lib/logger";

const messageSchema = z.object({
  body: z.string().min(1, "Message body is required").max(5000),
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
