import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

type RouteCtx = { params: Promise<{ id: string }> };

const requestInclude = {
  requestedBy: { select: { id: true, name: true, email: true, avatar: true } },
  assignedAdmin: { select: { id: true, name: true } },
  completedBy: { select: { id: true, name: true } },
  completedUser: { select: { id: true, name: true } },
  service: { select: { id: true, name: true } },
} as const;

/**
 * PATCH /api/onboarding-requests/[id] — admin-tier only.
 *
 * Three independent actions, any of which may be sent together:
 *   - `claim: true` — assignedAdminId = self (so two admins don't both
 *     work the same request without knowing it)
 *   - `status: "cancelled"` — drop a request that's no longer needed
 *   - `markCompleted: true` — the admin has created the actual User
 *     account elsewhere (Add staff member) and is closing the loop.
 *     Optionally links the request to the new account via
 *     `completedUserId` so the ticket shows what it produced.
 */
const patchBodySchema = z.object({
  claim: z.boolean().optional(),
  status: z.enum(["cancelled"]).optional(),
  markCompleted: z.boolean().optional(),
  completedUserId: z.string().optional().nullable(),
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;
    const raw = await parseJsonBody(req);
    const parsed = patchBodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid request payload", parsed.error.flatten());
    }
    const body = parsed.data;

    const existing = await prisma.newStarterRequest.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Request not found");
    if (existing.status === "completed" || existing.status === "cancelled") {
      throw ApiError.badRequest(`Request is already ${existing.status}`);
    }

    if (body.completedUserId) {
      const account = await prisma.user.findUnique({
        where: { id: body.completedUserId },
        select: { id: true },
      });
      if (!account) throw ApiError.badRequest("Linked user account not found");
    }

    const data: Record<string, unknown> = {};
    if (body.claim) data.assignedAdminId = session.user.id;
    if (body.status === "cancelled") data.status = "cancelled";
    if (body.markCompleted) {
      data.status = "completed";
      data.completedById = session.user.id;
      data.completedAt = new Date();
      if (body.completedUserId) data.completedUserId = body.completedUserId;
      // Claiming happens implicitly on completion if nobody had claimed yet.
      if (!existing.assignedAdminId) data.assignedAdminId = session.user.id;
    }

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest("No changes specified");
    }

    const updated = await prisma.newStarterRequest.update({
      where: { id },
      data,
      include: requestInclude,
    });

    await prisma.activityLog.create({
      data: {
        userId: session.user.id,
        action: "update",
        entityType: "NewStarterRequest",
        entityId: id,
        details: JSON.parse(JSON.stringify(data)),
      },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin"] },
);
