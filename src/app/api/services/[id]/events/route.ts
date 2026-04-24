import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { createServiceEventSchema } from "@/lib/schemas/service-event";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

function ensureServiceAccess(role: string, userServiceId: string | null | undefined, serviceId: string) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

// GET /api/services/[id]/events?from=YYYY-MM-DD&to=YYYY-MM-DD
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");

  const events = await prisma.serviceEvent.findMany({
    where: {
      serviceId: id,
      ...(from || to
        ? {
            date: {
              ...(from ? { gte: new Date(from) } : {}),
              ...(to ? { lte: new Date(to) } : {}),
            },
          }
        : {}),
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: {
      createdBy: { select: { id: true, name: true, avatar: true } },
    },
  });

  return NextResponse.json({ items: events });
});

// POST /api/services/[id]/events
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    ensureServiceAccess(session.user.role, session.user.serviceId, id);

    const body = await parseJsonBody(req);
    const parsed = createServiceEventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Excursion gate: require an approved RiskAssessment.
    // The RiskAssessment table lands in a later migration; until then we only
    // enforce that a `riskAssessmentId` is supplied for excursion events.
    // Once RiskAssessment exists, we additionally verify `approvedAt != null`
    // AND that the assessment matches (serviceId, date, activityType=excursion).
    if (data.eventType === "excursion") {
      if (!data.riskAssessmentId) {
        throw ApiError.badRequest(
          "Approved risk assessment required before creating an excursion event.",
        );
      }
      // TODO(phase-2): once RiskAssessment model exists, verify existence +
      // approvedAt + matching service/date/type here.
    }

    const created = await prisma.$transaction(async (tx) => {
      const service = await tx.service.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!service) throw ApiError.notFound("Service not found");

      const event = await tx.serviceEvent.create({
        data: {
          serviceId: id,
          createdById: session.user.id,
          eventType: data.eventType,
          title: data.title,
          date: new Date(data.date),
          startTime: data.startTime ? new Date(data.startTime) : null,
          endTime: data.endTime ? new Date(data.endTime) : null,
          notes: data.notes ?? null,
          riskAssessmentId: data.riskAssessmentId ?? null,
        },
        include: {
          createdBy: { select: { id: true, name: true, avatar: true } },
        },
      });

      await tx.activityLog.create({
        data: {
          userId: session.user.id,
          action: "created_service_event",
          entityType: "ServiceEvent",
          entityId: event.id,
          details: {
            serviceId: id,
            eventType: event.eventType,
            title: event.title,
            date: event.date.toISOString(),
          },
        },
      });

      return event;
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "coordinator"] },
);
