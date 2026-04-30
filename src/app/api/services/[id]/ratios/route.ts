import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { computeLiveRatios } from "@/lib/ratio-compute";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

function ensureServiceAccess(
  role: string,
  userServiceId: string | null | undefined,
  serviceId: string,
) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

// GET /api/services/[id]/ratios?date=YYYY-MM-DD&sessionType=
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const url = new URL(req.url);
  const dateParam = url.searchParams.get("date");
  const sessionType = url.searchParams.get("sessionType") ?? undefined;

  const now = new Date();
  const [live, snapshots] = await Promise.all([
    computeLiveRatios(id, now),
    prisma.ratioSnapshot.findMany({
      where: {
        serviceId: id,
        ...(dateParam ? { date: new Date(dateParam) } : {}),
        ...(sessionType ? { sessionType } : {}),
      },
      orderBy: [{ date: "desc" }, { capturedAt: "desc" }],
      take: 48, // up to 2 days of hourly snapshots
    }),
  ]);

  const liveFiltered = sessionType
    ? live.filter((r) => r.sessionType === sessionType)
    : live;

  return NextResponse.json({ live: liveFiltered, snapshots });
});
