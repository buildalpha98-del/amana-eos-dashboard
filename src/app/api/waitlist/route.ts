import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

/**
 * GET /api/waitlist — list waitlisted enquiries
 *
 * Query params:
 * - serviceId (optional) — filter by waitlist service
 * - status: "waiting" | "offered" | "all" (default: "all")
 */
export const GET = withApiAuth(async (req: NextRequest) => {
  const url = new URL(req.url);
  const serviceId = url.searchParams.get("serviceId");
  const status = url.searchParams.get("status") || "all";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: Record<string, any> = {
    stage: "waitlisted",
    deleted: false,
  };

  if (serviceId) {
    where.waitlistServiceId = serviceId;
  }

  if (status === "waiting") {
    where.waitlistOfferedAt = null;
  } else if (status === "offered") {
    where.waitlistOfferedAt = { not: null };
  }

  const enquiries = await prisma.parentEnquiry.findMany({
    where,
    orderBy: { waitlistPosition: "asc" },
    include: {
      service: { select: { id: true, name: true } },
    },
  });

  const now = Date.now();
  const results = enquiries.map((e) => ({
    id: e.id,
    parentName: e.parentName,
    parentEmail: e.parentEmail,
    parentPhone: e.parentPhone,
    childName: e.childName,
    childrenDetails: e.childrenDetails,
    waitlistPosition: e.waitlistPosition,
    waitlistJoinedAt: e.waitlistJoinedAt,
    waitlistOfferedAt: e.waitlistOfferedAt,
    waitlistExpiresAt: e.waitlistExpiresAt,
    serviceName: e.service?.name ?? null,
    daysWaiting: e.waitlistJoinedAt
      ? Math.floor((now - e.waitlistJoinedAt.getTime()) / (1000 * 60 * 60 * 24))
      : 0,
  }));

  return NextResponse.json(results);
}, { roles: ["owner", "head_office", "admin", "member"] });
