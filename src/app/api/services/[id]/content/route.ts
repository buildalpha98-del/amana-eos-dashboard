/**
 * /api/services/[id]/content
 *
 * Per-service editable content (About, hero image, key contacts, daily
 * routine, food provider, parent onboarding). Stored on `Service.content`
 * as a JSON document validated against the Zod schema in
 * src/lib/service-content-shared.ts.
 *
 * GET   — any authenticated user gets the parent-facing fields (the
 *         content is parent-facing, not confidential; service-scope read
 *         restrictions are about confidential ops data like
 *         incidents/ratios, not About copy). Staff-only fields (gate/alarm
 *         codes, etc — see STAFF_ONLY_FIELDS) are additionally scoped by
 *         `getCentreScope`: only visible to org-wide admin tiers or a
 *         caller attached to THIS service.
 * PATCH — org-wide admin (owner / head_office / admin) OR the Director
 *         of Service whose `User.serviceId` matches this service.
 *
 * 2026-05-16.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import {
  mergeServiceContent,
  serviceContentSchema,
  toParentContent,
} from "@/lib/service-content-shared";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { getCentreScope } from "@/lib/centre-scope";
import { syncAfterResponse } from "@/lib/knowledge/hooks";
import { syncCentreFacts } from "@/lib/knowledge/adapters/centre-facts";

type RouteCtx = { params: Promise<{ id: string }> };

const ORG_WIDE_EDIT_ROLES = new Set<string>(ADMIN_ROLES);

const MAX_BYTES = 100_000;

export const GET = withApiAuth(async (_req, session, context) => {
  const { id: serviceId } = await (context as unknown as RouteCtx).params;
  const row = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { content: true, updatedAt: true },
  });
  if (!row) throw ApiError.notFound("Service not found");
  const merged = mergeServiceContent(row.content);
  // Staff-only fields (gate/alarm codes…) are visible only inside the
  // caller's own centre scope: org-wide admin tier, or a centre the user
  // is attached to (getCentreScope = primary + manager-of + memberships;
  // null = unscoped). Everyone else gets the parent-safe view.
  const { serviceIds } = await getCentreScope(session!);
  const inScope = serviceIds === null || serviceIds.includes(serviceId);
  return NextResponse.json({
    content: inScope ? merged : toParentContent(merged),
    updatedAt: row.updatedAt,
  });
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id: serviceId } = await (context as unknown as RouteCtx).params;

    // Authorisation: org-wide admin tier OR the Director of Service who
    // owns this centre. The User.serviceId column is the staff member's
    // home service — that's the right anchor here because per-service
    // edits are operations led by the centre lead.
    const role = session!.user.role;
    const userServiceId =
      (session!.user as { serviceId?: string | null }).serviceId ?? null;
    const isOrgAdmin = ORG_WIDE_EDIT_ROLES.has(role);
    const isDirectorOfThisService =
      role === "member" && userServiceId === serviceId;
    if (!isOrgAdmin && !isDirectorOfThisService) {
      throw ApiError.forbidden(
        "Only an admin or this service's Director can edit its content.",
      );
    }

    const body = await parseJsonBody(req);
    const parsed = serviceContentSchema.safeParse(
      (body as { content?: unknown })?.content,
    );
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues[0]?.message ?? "Invalid service content payload",
        parsed.error.flatten(),
      );
    }

    const serialized = JSON.stringify(parsed.data);
    if (serialized.length > MAX_BYTES) {
      throw ApiError.badRequest(
        `Content too large (${serialized.length} bytes, max ${MAX_BYTES}).`,
      );
    }

    const existing = await prisma.service.findUnique({
      where: { id: serviceId },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Service not found");

    const updated = await prisma.service.update({
      where: { id: serviceId },
      data: { content: parsed.data },
      select: { content: true, updatedAt: true },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "update_service_content",
        entityType: "Service",
        entityId: serviceId,
        details: { fields: Object.keys(parsed.data).length },
      },
    });

    syncAfterResponse("centre_facts", () => syncCentreFacts(serviceId));

    return NextResponse.json({
      content: mergeServiceContent(updated.content),
      updatedAt: updated.updatedAt,
    });
  },
  { rateLimit: { max: 30, windowMs: 60_000 } },
);
