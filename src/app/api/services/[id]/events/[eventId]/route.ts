import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { updateServiceEventSchema } from "@/lib/schemas/service-event";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

function ensureServiceAccess(role: string, userServiceId: string | null | undefined, serviceId: string) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

type RouteCtx = { params: Promise<{ id: string; eventId: string }> };

// PATCH /api/services/[id]/events/[eventId]
export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id, eventId } = await (context as unknown as RouteCtx).params;
    ensureServiceAccess(session.user.role, session.user.serviceId, id);

    const body = await parseJsonBody(req);
    const parsed = updateServiceEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const existing = await prisma.serviceEvent.findUnique({
      where: { id: eventId },
      select: { id: true, serviceId: true, eventType: true },
    });
    if (!existing) throw ApiError.notFound("Event not found");
    if (existing.serviceId !== id) throw ApiError.notFound("Event not found");

    const patch = parsed.data;
    const nextType = patch.eventType ?? existing.eventType;

    if (nextType === "excursion") {
      const nextRa =
        "riskAssessmentId" in patch ? patch.riskAssessmentId : undefined;
      // If caller unsets the risk assessment or the event becomes an excursion
      // without one, block.
      if (!nextRa && patch.eventType === "excursion") {
        throw ApiError.badRequest(
          "Approved risk assessment required before creating an excursion event.",
        );
      }
    }

    const updated = await prisma.serviceEvent.update({
      where: { id: eventId },
      data: {
        ...(patch.eventType ? { eventType: patch.eventType } : {}),
        ...(patch.title ? { title: patch.title } : {}),
        ...(patch.date ? { date: new Date(patch.date) } : {}),
        ...("startTime" in patch
          ? { startTime: patch.startTime ? new Date(patch.startTime) : null }
          : {}),
        ...("endTime" in patch
          ? { endTime: patch.endTime ? new Date(patch.endTime) : null }
          : {}),
        ...("notes" in patch ? { notes: patch.notes ?? null } : {}),
        ...("riskAssessmentId" in patch
          ? { riskAssessmentId: patch.riskAssessmentId ?? null }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true, avatar: true } },
      },
    });

    return NextResponse.json(updated);
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

// DELETE /api/services/[id]/events/[eventId]
export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id, eventId } = await (context as unknown as RouteCtx).params;
    ensureServiceAccess(session.user.role, session.user.serviceId, id);

    const existing = await prisma.serviceEvent.findUnique({
      where: { id: eventId },
      select: { id: true, serviceId: true },
    });
    if (!existing) throw ApiError.notFound("Event not found");
    if (existing.serviceId !== id) throw ApiError.notFound("Event not found");

    await prisma.serviceEvent.delete({ where: { id: eventId } });
    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
