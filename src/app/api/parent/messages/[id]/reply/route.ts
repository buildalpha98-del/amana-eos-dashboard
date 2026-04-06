import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendNewMessageNotification } from "@/lib/notifications/messaging";

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
    select: { id: true, firstName: true, lastName: true },
  });
  return contacts.map((c) => c.id);
}

// ---------------------------------------------------------------------------
// POST — Parent replies to a conversation
// ---------------------------------------------------------------------------

const replySchema = z.object({
  body: z.string().min(1, "Message is required").max(5000),
});

export const POST = withParentAuth(async (req, ctx) => {
  const params = await ctx.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Conversation id is required");

  const raw = await parseJsonBody(req);
  const parsed = replySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid reply data",
      parsed.error.flatten().fieldErrors,
    );
  }

  // Verify ownership
  const contactIds = await getParentContactIds(
    ctx.parent.email,
    ctx.parent.enrolmentIds,
  );

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    select: { id: true, familyId: true },
  });

  if (!conversation) throw ApiError.notFound("Conversation not found");
  if (!contactIds.includes(conversation.familyId)) {
    throw ApiError.forbidden("You do not have access to this conversation");
  }

  // Resolve sender name from CentreContact
  const contact = await prisma.centreContact.findUnique({
    where: { id: conversation.familyId },
    select: { firstName: true, lastName: true },
  });

  const senderName = contact
    ? [contact.firstName, contact.lastName].filter(Boolean).join(" ")
    : ctx.parent.name;

  const [message] = await prisma.$transaction([
    prisma.message.create({
      data: {
        conversationId: id,
        body: parsed.data.body,
        senderType: "parent",
        senderId: conversation.familyId,
        senderName: senderName || "Parent",
      },
    }),
    prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        status: "open", // Re-open if resolved
      },
    }),
  ]);

  // Fire and forget notification to coordinator
  sendNewMessageNotification(message.id).catch(() => {});

  return NextResponse.json(message, { status: 201 });
});
