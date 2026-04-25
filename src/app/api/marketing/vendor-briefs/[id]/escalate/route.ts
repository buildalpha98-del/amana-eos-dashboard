import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { briefIncludeFor, toListItem } from "@/lib/vendor-brief/list-item";

const ROLES: ("marketing" | "owner" | "head_office" | "admin")[] = ["marketing", "owner", "head_office", "admin"];

type RouteCtx = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  escalatedToUserId: z.string().optional(),
  reason: z.string().min(1, "Escalation reason is required").max(5000),
});

/**
 * POST /api/marketing/vendor-briefs/[id]/escalate
 *
 * Marks the brief as escalated. Does NOT change the status — escalation is
 * a flag. Side effect: creates a MarketingTask assigned to the escalation
 * target so the senior receives a clear action item.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as RouteCtx).params;

    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid escalate payload", parsed.error.flatten());
    }
    const { reason } = parsed.data;

    const existing = await prisma.vendorBrief.findUnique({
      where: { id },
      select: { id: true, briefNumber: true, title: true, serviceId: true },
    });
    if (!existing) throw ApiError.notFound("Vendor brief not found");

    // Resolve the escalation target. Defaults to first user with role 'owner'.
    let escalatedToUserId = parsed.data.escalatedToUserId;
    if (!escalatedToUserId) {
      const owner = await prisma.user.findFirst({
        where: { role: "owner", active: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      if (!owner) {
        throw ApiError.badRequest(
          "No owner user found to escalate to. Pass `escalatedToUserId` explicitly.",
        );
      }
      escalatedToUserId = owner.id;
    }

    const now = new Date();

    const [brief] = await prisma.$transaction([
      prisma.vendorBrief.update({
        where: { id },
        data: {
          escalatedAt: now,
          escalatedToUserId,
          escalationReason: reason,
        },
        include: briefIncludeFor,
      }),
      prisma.marketingTask.create({
        data: {
          title: `[Escalated] Vendor brief ${existing.briefNumber}: ${existing.title}`,
          description:
            `Vendor brief ${existing.briefNumber} ("${existing.title}") was escalated by ` +
            `${session.user.name ?? "a marketing user"}.\n\nReason: ${reason}`,
          priority: "high",
          status: "todo",
          assigneeId: escalatedToUserId,
          serviceId: existing.serviceId,
        },
      }),
    ]);

    return NextResponse.json({ brief: toListItem(brief) });
  },
  { roles: ROLES },
);
