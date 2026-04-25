import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { safeLimit } from "@/lib/pagination";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

/**
 * Action codes the staff dashboard's ActivityLog rows can carry. We narrow
 * to the NQS surface — staff don't need to see "logged in", "exported csv",
 * etc. when they're triaging today's activity.
 */
const NQS_ACTIONS = [
  "created_reflection",
  "created_observation",
  "logged_medication",
  "created_risk_assessment",
  "approved_risk_assessment",
  "created_service_event",
  "published_newsletter",
] as const;

/**
 * GET /api/services/[id]/activity?limit=50
 *
 * Returns recent NQS-surface ActivityLog entries for one service. Filtered
 * server-side by:
 *   - `action` ∈ NQS_ACTIONS
 *   - `details.serviceId === id` (the writes I added in the v2 push include
 *     serviceId in details for exactly this lookup)
 *
 * Used by the Service Today tab's "Recent activity" widget so coordinators
 * see who logged what without leaving the page.
 */
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  if (
    !ORG_WIDE_ROLES.has(session.user.role) &&
    session.user.serviceId !== id
  ) {
    throw ApiError.forbidden("You do not have access to this service");
  }

  const url = new URL(req.url);
  const limit = safeLimit(url.searchParams.get("limit"), 25, 100);

  // Prisma JSON path filtering — `details->>'serviceId' = id`. We pull a
  // wider window than `take: limit` because the JSON filter isn't perfectly
  // selective and we want stable pagination.
  const rows = await prisma.activityLog.findMany({
    where: {
      action: { in: [...NQS_ACTIONS] },
      details: { path: ["serviceId"], equals: id },
    },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      user: { select: { id: true, name: true, avatar: true } },
    },
  });

  // Strip noisy fields the UI doesn't need + add a friendly action label.
  const ACTION_LABEL: Record<string, string> = {
    created_reflection: "wrote a reflection",
    created_observation: "logged an observation",
    logged_medication: "logged a medication dose",
    created_risk_assessment: "submitted a risk assessment",
    approved_risk_assessment: "approved a risk assessment",
    created_service_event: "created a service event",
    published_newsletter: "published a parent newsletter",
  };

  const items = rows.map((r) => ({
    id: r.id,
    action: r.action,
    actionLabel: ACTION_LABEL[r.action] ?? r.action,
    entityType: r.entityType,
    entityId: r.entityId,
    details: r.details,
    createdAt: r.createdAt.toISOString(),
    user: r.user,
  }));

  return NextResponse.json({ items });
});
