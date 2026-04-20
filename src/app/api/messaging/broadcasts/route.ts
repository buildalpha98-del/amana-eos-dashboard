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
});

export const POST = withApiAuth(async (req: NextRequest, session) => {
  const raw = await parseJsonBody(req);
  const parsed = broadcastSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid broadcast data", parsed.error.flatten().fieldErrors);
  }

  const { serviceId, subject, body } = parsed.data;

  // Verify service exists
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  // Find all active families with enrolled children at this service
  const families = await prisma.centreContact.findMany({
    where: {
      serviceId,
      status: { in: ["subscribed", "active"] },
    },
    select: { id: true },
  });

  const familyIds = families.map((f) => f.id);

  const broadcast = await prisma.broadcast.create({
    data: {
      serviceId,
      subject,
      body,
      sentById: session.user!.id!,
      sentByName: session.user!.name ?? "Staff",
      recipientCount: familyIds.length,
    },
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  // Fire and forget email notifications
  if (familyIds.length > 0) {
    sendBroadcastNotification(broadcast.id, familyIds).catch((err) => logger.error("Failed to send broadcast notifications", { err, broadcastId: broadcast.id, familyCount: familyIds.length }));
  }

  return NextResponse.json(broadcast, { status: 201 });
});
