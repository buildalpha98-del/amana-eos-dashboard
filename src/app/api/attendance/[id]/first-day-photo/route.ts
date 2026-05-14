import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { sendSms, normaliseAuMobile } from "@/lib/sms";
import { primaryParentSchema } from "@/lib/schemas/json-fields";
import { logger } from "@/lib/logger";

const bodySchema = z.object({
  photoUrl: z.string().url("photoUrl must be a valid URL"),
});

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST /api/attendance/[id]/first-day-photo
 *
 * Amana Way stage 5 (Reassurance — Parent Peace of Mind). Staff snaps a
 * photo of the child on their first day and sends it to the parent's
 * mobile. The body of the SMS includes a link to the hosted photo (the
 * blob URL on Vercel — public-access).
 *
 * Idempotent: once `firstDayPhotoSentAt` is set on the AttendanceRecord
 * the route returns 409 instead of re-sending.
 */
export const POST = withApiAuth(async (req, _session, context) => {
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
    throw ApiError.conflict(
      "First-day photo SMS already sent for this attendance",
    );
  }

  const parentMobileRaw = await resolveParentMobile(
    record.child.enrolment?.primaryParent,
    record.serviceId,
    record.child.firstName,
    record.child.surname,
  );

  if (!parentMobileRaw) {
    throw ApiError.badRequest(
      "No parent mobile on file for this child — add one in the parent profile first",
    );
  }

  const normalised = normaliseAuMobile(parentMobileRaw);
  if (!normalised) {
    throw ApiError.badRequest(
      `Parent mobile "${parentMobileRaw}" isn't a valid AU mobile`,
    );
  }

  const centreName = record.service.name;
  const childFirst = record.child.firstName;
  const smsBody =
    `Hi from ${centreName}! 👋 ${childFirst} had a great first day with us. ` +
    `Here's a photo: ${photoUrl}`;

  const result = await sendSms({
    to: { number: normalised },
    body: smsBody,
  });

  if (!result.ok) {
    logger.warn("first-day-photo: SMS dispatch failed", {
      attendanceId: id,
      reason: result.reason,
    });
    throw ApiError.badRequest(
      result.reason === "not_configured"
        ? "SMS provider not configured — set SMS_PROVIDER env"
        : "SMS dispatch failed — see server logs",
    );
  }

  await prisma.attendanceRecord.update({
    where: { id },
    data: {
      firstDayPhotoUrl: photoUrl,
      firstDayPhotoSentAt: new Date(),
      firstDayPhotoSentTo: normalised,
    },
  });

  return NextResponse.json({ ok: true, sentTo: normalised });
});

async function resolveParentMobile(
  primaryParentJson: unknown,
  serviceId: string,
  _childFirst: string,
  _childSurname: string,
): Promise<string | null> {
  // 1. Try the enrolment's primary parent first (most authoritative)
  const parsedResult = primaryParentSchema.safeParse(primaryParentJson);
  const parsed = parsedResult.success ? parsedResult.data : null;
  if (parsed?.mobile && parsed.mobile.trim()) {
    return parsed.mobile.trim();
  }

  // 2. Fall back to any active CentreContact for this service with a mobile
  //    matching the primary parent's email. Without an email we skip this
  //    step rather than guessing.
  if (parsed?.email) {
    const contact = await prisma.centreContact.findFirst({
      where: {
        serviceId,
        email: parsed.email.toLowerCase().trim(),
        status: "active",
        mobile: { not: null },
      },
      select: { mobile: true },
    });
    if (contact?.mobile) return contact.mobile;
  }

  return null;
}
