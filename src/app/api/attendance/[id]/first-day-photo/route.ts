import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { primaryParentSchema } from "@/lib/schemas/json-fields";
import { createInAppNotification } from "@/lib/parent-notifications";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  photoUrl: z.string().url("photoUrl must be a valid URL"),
});

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST /api/attendance/[id]/first-day-photo
 *
 * Amana Way stage 5 (Reassurance — Parent Peace of Mind). Staff snap a
 * photo of a child on their first day and it lands in the family's
 * portal as a message, with the photo attached.
 *
 * 2026-08-03: this used to be an SMS carrying a public blob URL. A text
 * message is the wrong home for a photo of somebody's child — the link
 * works for anyone the message is forwarded to, it depends on a valid
 * mobile being on file, and there's nowhere for the parent to go back
 * and find the photo later. In the portal it's readable only by someone
 * signed in, it raises a notification, and it stays in the child's
 * gallery.
 *
 * Idempotent: once `firstDayPhotoSentAt` is set on the AttendanceRecord
 * the route returns 409 rather than sending a second time.
 */
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await (context as unknown as RouteCtx).params;
  if (!id) throw ApiError.badRequest("Missing attendance id");
  const parsed = bodySchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid input", parsed.error.flatten());
  }
  const { photoUrl } = parsed.data;

  const record = await prisma.attendanceRecord.findUnique({
    where: { id },
    select: {
      id: true,
      childId: true,
      serviceId: true,
      firstDayPhotoSentAt: true,
      child: {
        select: {
          firstName: true,
          surname: true,
          enrolment: { select: { primaryParent: true } },
        },
      },
      service: { select: { name: true } },
    },
  });

  if (!record) throw ApiError.notFound("Attendance record not found");
  if (record.firstDayPhotoSentAt) {
    throw ApiError.conflict("First-day photo already sent to this family");
  }

  const centreName = record.service.name;
  const childFirst = record.child.firstName;

  const parentEmail = resolveParentEmail(record.child.enrolment?.primaryParent);
  if (!parentEmail) {
    throw ApiError.badRequest(
      "No parent email on file for this child — add one on the family's account first",
    );
  }

  // The family's contact at THIS centre. It's the same row the parent
  // portal authenticates a conversation against, so a message created
  // here appears in their Messages exactly like one they sent.
  const contact = await prisma.centreContact.findFirst({
    where: { email: parentEmail.toLowerCase(), serviceId: record.serviceId },
    select: { id: true },
  });
  if (!contact) {
    throw ApiError.badRequest(
      `${parentEmail} has no contact record at ${centreName} — confirm the enrolment first`,
    );
  }

  const conversation = await prisma.conversation.create({
    data: {
      serviceId: record.serviceId,
      familyId: contact.id,
      subject: `${childFirst}'s first day`,
      lastMessageAt: new Date(),
      messages: {
        create: {
          body:
            `${childFirst} had a great first day with us at ${centreName}. ` +
            `Here's a photo from today.`,
          attachmentUrls: [photoUrl],
          senderType: "staff",
          senderId: session?.user?.id ?? null,
          senderName: session?.user?.name ?? centreName,
        },
      },
    },
    select: { id: true },
  });

  await createInAppNotification({
    parentEmail: parentEmail.toLowerCase(),
    type: "message",
    title: `A photo from ${childFirst}'s first day`,
    body: `${centreName} sent you a photo.`,
    link: `/parent/messages/${conversation.id}`,
  });

  await prisma.attendanceRecord.update({
    where: { id },
    data: {
      firstDayPhotoUrl: photoUrl,
      firstDayPhotoSentAt: new Date(),
      firstDayPhotoSentTo: parentEmail.toLowerCase(),
    },
  });

  logger.info("First-day photo sent to the parent portal", {
    attendanceId: id,
    conversationId: conversation.id,
  });

  return NextResponse.json({
    ok: true,
    sentTo: parentEmail,
    conversationId: conversation.id,
  });
});

/** Primary parent's email from the enrolment's JSON blob. */
function resolveParentEmail(primaryParentJson: unknown): string | null {
  const parsed = primaryParentSchema.safeParse(primaryParentJson);
  if (parsed.success && parsed.data.email?.trim()) {
    return parsed.data.email.trim();
  }
  return null;
}
