import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { sendBroadcastNotification } from "@/lib/notifications/messaging";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// GET — List broadcasts
// ---------------------------------------------------------------------------

export const GET = withApiAuth(async (req: NextRequest) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId") ?? undefined;

  const where: Record<string, unknown> = {};
  if (serviceId) where.serviceId = serviceId;

  const broadcasts = await prisma.broadcast.findMany({
    where,
    orderBy: { sentAt: "desc" },
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(broadcasts);
});

// ---------------------------------------------------------------------------
// POST — Send a broadcast to all families at a service
// ---------------------------------------------------------------------------

const broadcastSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  subject: z.string().min(1, "Subject is required").max(200),
  body: z.string().min(1, "Message body is required").max(10000),
  /// Channels to dispatch on — defaults to email if omitted (legacy behaviour).
  /// SMS recipients are filtered server-side on `CentreContact.smsOptIn` so
  /// callers don't need to pre-filter.
  channels: z
    .array(z.enum(["email", "sms", "push"]))
    .min(1)
    .default(["email"]),
});

export const POST = withApiAuth(async (req: NextRequest, session) => {
  const raw = await parseJsonBody(req);
  const parsed = broadcastSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid broadcast data", parsed.error.flatten().fieldErrors);
  }

  const { serviceId, subject, body, channels } = parsed.data;

  // Verify service exists
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  // Find all active families with enrolled children at this service.
  // smsOptIn + mobile must both be present for SMS dispatch, so we read
  // both here and let the dispatcher filter per-channel.
  const families = await prisma.centreContact.findMany({
    where: {
      serviceId,
      status: { in: ["subscribed", "active"] },
    },
    select: { id: true, smsOptIn: true, mobile: true },
  });

  const familyIds = families.map((f) => f.id);
  const smsEligibleCount = channels.includes("sms")
    ? families.filter((f) => f.smsOptIn && f.mobile).length
    : 0;

  const broadcast = await prisma.broadcast.create({
    data: {
      serviceId,
      subject,
      body,
      channels,
      sentById: session.user!.id!,
      sentByName: session.user!.name ?? "Staff",
      recipientCount: familyIds.length,
      smsRecipientCount: smsEligibleCount,
    },
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  // Fire and forget — dispatcher handles per-channel routing internally.
  if (familyIds.length > 0) {
    sendBroadcastNotification(broadcast.id, familyIds, channels).catch((err) =>
      logger.error("Failed to send broadcast notifications", {
        err,
        broadcastId: broadcast.id,
        familyCount: familyIds.length,
        channels,
      }),
    );
  }

  return NextResponse.json(broadcast, { status: 201 });
});
