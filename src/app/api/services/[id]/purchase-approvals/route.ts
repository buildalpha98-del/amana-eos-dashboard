/**
 * GET  /api/services/[id]/purchase-approvals — list for a service
 * POST /api/services/[id]/purchase-approvals — staff raise a request
 *
 * Visibility:
 *   - admin / owner / head_office: full read on every service
 *   - the service's manager (member at this service): full read on
 *     their own service
 *   - other staff at the service: read their own + create their own
 *   - everyone else: 403
 *
 * Notifications on POST go to (deduped):
 *   - owner + head_office (org-wide approvers)
 *   - admin = State Manager — only when service.state matches the
 *     admin's user.state (admins with no state set fall through to
 *     org-wide so legacy seed data still works)
 *   - service.managerId (the Director of Service for this centre)
 *   - the requester is removed from the recipient set
 *
 * 2026-06-02 — initial cut.
 * 2026-06-03 — scoped admin notifications to their state.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { isAdminRole } from "@/lib/role-permissions";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  vendor: z.string().min(1).max(200),
  product: z.string().min(1).max(500),
  // Accept dollars from the client; convert to cents server-side.
  // Positive cap at $5000 — anything bigger should go through a
  // different process anyway.
  costDollars: z.number().positive().max(5000),
  reason: z.string().max(2000).optional().nullable(),
});

const ADMIN_ROLES = new Set(["owner", "head_office", "admin"]);

interface RouteContext {
  params: Promise<{ id: string }>;
}

export const GET = withApiAuth(async (_req, session, context) => {
  const { id: serviceId } = await (context as unknown as RouteContext).params;
  const role = session!.user.role;
  const userId = session!.user.id;
  const isAdmin = ADMIN_ROLES.has(role);

  // Confirm service exists + grab the manager so we know who has
  // service-wide visibility.
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, managerId: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  // Caller must be admin OR the service manager OR a staff member of
  // the service (we only show them their OWN approvals in that case).
  const isManager = service.managerId === userId;
  let where: Record<string, unknown> = { serviceId };
  if (!isAdmin && !isManager) {
    // Confirm the caller is at least a staff member of this service.
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { serviceId: true },
    });
    if (me?.serviceId !== serviceId) {
      throw ApiError.forbidden();
    }
    // Staff sees only their own requests.
    where = { serviceId, requestedById: userId };
  }

  const approvals = await prisma.purchaseApproval.findMany({
    where,
    include: {
      requestedBy: { select: { id: true, name: true } },
      decidedBy: { select: { id: true, name: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json({ approvals });
});

export const POST = withApiAuth(async (req, session, context) => {
  const { id: serviceId } = await (context as unknown as RouteContext).params;
  const userId = session!.user.id;
  const role = session!.user.role;
  const isAdmin = ADMIN_ROLES.has(role);

  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, managerId: true, name: true, state: true },
  });
  if (!service) throw ApiError.notFound("Service not found");

  // Caller must work at this service OR be an admin / the manager.
  // We don't want a staff member at Service A raising approvals
  // against Service B's budget.
  const isManager = service.managerId === userId;
  if (!isAdmin && !isManager) {
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { serviceId: true },
    });
    if (me?.serviceId !== serviceId) {
      throw ApiError.forbidden(
        "You can only raise approvals for the service you work at.",
      );
    }
  }

  const raw = await parseJsonBody(req);
  const parsed = createSchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest(
      parsed.error.issues[0]?.message ?? "Validation failed",
    );
  }
  const { vendor, product, costDollars, reason } = parsed.data;
  const costCents = Math.round(costDollars * 100);

  const created = await prisma.purchaseApproval.create({
    data: {
      serviceId,
      requestedById: userId,
      vendor: vendor.trim(),
      product: product.trim(),
      costCents,
      reason: reason?.trim() || null,
    },
    include: {
      requestedBy: { select: { id: true, name: true } },
    },
  });

  // Fan out a UserNotification to every approver who has authority
  // for this service:
  //
  //   - owner + head_office  → org-wide oversight, always notified
  //   - admin (State Manager) → only if user.state matches
  //     service.state. A NSW State Manager shouldn't get pinged for
  //     a VIC request. Admins with no state set are treated as
  //     org-wide (defensive — keeps the seed data working).
  //   - service.managerId    → the Director of Service for this
  //     centre. They're a valid approver per the PATCH route and
  //     they should know what their team is requesting.
  //
  // We collect IDs into a Set so the service manager doesn't double
  // up if they happen to also be admin / head_office.
  const candidates = await prisma.user.findMany({
    where: {
      active: true,
      OR: [
        { role: { in: ["owner", "head_office"] } },
        // State-scoped admins: same state as the service, or no
        // state set (legacy / org-wide admin).
        {
          role: "admin",
          OR: [{ state: service.state ?? null }, { state: null }],
        },
      ],
    },
    select: { id: true },
  });
  const recipientIds = new Set<string>(candidates.map((u) => u.id));
  if (service.managerId) recipientIds.add(service.managerId);
  // Don't notify the requester themselves — they raised it.
  recipientIds.delete(userId);

  if (recipientIds.size > 0) {
    await prisma.userNotification.createMany({
      data: Array.from(recipientIds).map((id) => ({
        userId: id,
        type: "purchase_approval_requested",
        title: `New purchase approval — ${service.name}`,
        body: `${created.requestedBy.name} wants to buy ${product} from ${vendor} for $${costDollars.toFixed(2)}.`,
        link: `/services/${serviceId}?tab=finance&sub=approvals`,
      })),
    });
  }

  await prisma.activityLog.create({
    data: {
      userId,
      action: "purchase_approval_created",
      entityType: "PurchaseApproval",
      entityId: created.id,
      details: { serviceId, vendor, product, costCents },
    },
  });

  logger.info("Purchase approval created", {
    id: created.id,
    serviceId,
    requestedById: userId,
    costCents,
  });

  return NextResponse.json(created, { status: 201 });
});
