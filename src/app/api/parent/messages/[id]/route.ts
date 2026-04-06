import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

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
    select: { id: true },
  });
  return contacts.map((c) => c.id);
}

// ---------------------------------------------------------------------------
// GET — Get conversation detail with messages
// ---------------------------------------------------------------------------

export const GET = withParentAuth(async (_req, ctx) => {
  const params = await ctx.params;
  const id = params?.id;
  if (!id) throw ApiError.badRequest("Conversation id is required");

  // Verify ownership
  const contactIds = await getParentContactIds(
    ctx.parent.email,
    ctx.parent.enrolmentIds,
  );

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      service: { select: { id: true, name: true } },
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!conversation) throw ApiError.notFound("Conversation not found");
  if (!contactIds.includes(conversation.familyId)) {
    throw ApiError.forbidden("You do not have access to this conversation");
  }

  // Mark all staff messages as read
  const unreadStaffMsgIds = conversation.messages
    .filter((m) => m.senderType === "staff" && !m.isRead)
    .map((m) => m.id);

  if (unreadStaffMsgIds.length > 0) {
    await prisma.message.updateMany({
      where: { id: { in: unreadStaffMsgIds } },
      data: { isRead: true, readAt: new Date() },
    });

    for (const msg of conversation.messages) {
      if (unreadStaffMsgIds.includes(msg.id)) {
        msg.isRead = true;
        msg.readAt = new Date();
      }
    }
  }

  return NextResponse.json(conversation);
});
