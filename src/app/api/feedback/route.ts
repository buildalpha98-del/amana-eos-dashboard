import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const STATUS_VALUES = ["new", "reviewing", "actioned", "dismissed", "reviewed", "closed"] as const;

const querySchema = z.object({
  status: z.enum(STATUS_VALUES).optional(),
  source: z.string().optional(),
  serviceId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/**
 * GET /api/feedback — list parent feedback entries for the triage queue.
 *
 * Surfaces SMS replies (`source: "sms_reply"`), NPS survey submissions, and
 * any other ParentFeedback rows. Default sort: most recent first.
 */
export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const parsed = querySchema.safeParse(
    Object.fromEntries(url.searchParams.entries()),
  );
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const { status, source, serviceId, limit } = parsed.data;

  const rows = await prisma.parentFeedback.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
      ...(serviceId ? { serviceId } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      id: true,
      source: true,
      channel: true,
      surveyType: true,
      fromNumber: true,
      parentName: true,
      parentEmail: true,
      childName: true,
      comments: true,
      npsScore: true,
      overallRating: true,
      category: true,
      sentiment: true,
      status: true,
      reviewedAt: true,
      reviewedBy: { select: { id: true, name: true } },
      service: { select: { id: true, name: true } },
      contact: { select: { id: true, firstName: true, lastName: true } },
      child: { select: { id: true, firstName: true, surname: true } },
      createdAt: true,
    },
  });

  return NextResponse.json({ items: rows });
});
