import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

const ORG_WIDE_ROLES = new Set(["owner", "head_office", "admin"]);

/**
 * GET /api/qip/[id]/suggestions?status=pending|all
 *
 * AI-proposed SAT/QIP updates for director review. Defaults to pending;
 * `status=all` includes the reviewed audit trail.
 */
export const GET = withApiAuth(
  async (req, session, context) => {
    const { id: qipId } = await context!.params!;

    const qip = await prisma.qualityImprovementPlan.findUnique({
      where: { id: qipId },
      select: { id: true, serviceId: true },
    });
    if (!qip) throw ApiError.notFound("QIP not found");
    if (
      !ORG_WIDE_ROLES.has(session.user.role) &&
      session.user.serviceId !== qip.serviceId
    ) {
      throw ApiError.forbidden("You do not have access to this service's QIP");
    }

    const url = new URL(req.url);
    const status = url.searchParams.get("status") ?? "pending";

    const suggestions = await prisma.qipSuggestion.findMany({
      where: {
        qipId,
        ...(status === "all" ? {} : { status }),
      },
      orderBy: [{ weekOf: "desc" }, { qualityArea: "asc" }, { createdAt: "asc" }],
      include: {
        reviewedBy: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ suggestions, count: suggestions.length });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
