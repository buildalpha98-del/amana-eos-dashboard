import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// GET — Conversation detail with messages; mark parent messages read
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (_req, _session, context) => {
  const { id } = await context!.params!;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      family: { select: { id: true, firstName: true, lastName: true, email: true } },
      service: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) throw ApiError.notFound("Conversation not found");

  // Mark all parent messages as read
  const unreadParentMsgIds = conversation.messages
    .filter((m) => m.senderType === "parent" && !m.isRead)
    .map((m) => m.id);

  if (unreadParentMsgIds.length > 0) {
    await prisma.message.updateMany({
      where: { id: { in: unreadParentMsgIds } },
      data: { isRead: true, readAt: new Date() },
    });

    // Update local data for response
    for (const msg of conversation.messages) {
      if (unreadParentMsgIds.includes(msg.id)) {
        msg.isRead = true;
        msg.readAt = new Date();
      }
    }
  }

  return NextResponse.json(conversation);
});

// ---------------------------------------------------------------------------
// PATCH — Update conversation status
// ---------------------------------------------------------------------------

const patchSchema = z.object({
  status: z.enum(["resolved", "archived"]),
});

export const PATCH = withApiAuth(async (req, _session, context) => {
  const { id } = await context!.params!;
  const raw = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid status", parsed.error.flatten().fieldErrors);
  }

  const existing = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) throw ApiError.notFound("Conversation not found");

  const updated = await prisma.conversation.update({
    where: { id },
    data: { status: parsed.data.status },
    include: {
      family: { select: { id: true, firstName: true, lastName: true } },
      service: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(updated);
});
