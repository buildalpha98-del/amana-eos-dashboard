import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { briefIncludeFor, toListItem } from "@/lib/vendor-brief/list-item";

const ROLES: ("marketing" | "owner" | "head_office" | "admin")[] = ["marketing", "owner", "head_office", "admin"];

type RouteCtx = { params: Promise<{ id: string }> };

/**
 * POST /api/marketing/vendor-briefs/[id]/clear-escalation
 *
 * Clears the escalation flags. Does NOT delete the auto-created
 * MarketingTask — the escalation target completes that themselves.
 */
export const POST = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;

    const existing = await prisma.vendorBrief.findUnique({
      where: { id },
      select: { id: true, escalatedAt: true },
    });
    if (!existing) throw ApiError.notFound("Vendor brief not found");

    if (!existing.escalatedAt) {
      throw ApiError.badRequest("Brief is not currently escalated.");
    }

    const updated = await prisma.vendorBrief.update({
      where: { id },
      data: {
        escalatedAt: null,
        escalatedToUserId: null,
        escalationReason: null,
      },
      include: briefIncludeFor,
    });

    return NextResponse.json({ brief: toListItem(updated) });
  },
  { roles: ROLES },
);
