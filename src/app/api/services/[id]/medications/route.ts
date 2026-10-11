import { serviceTodayISO, serviceMidnight, addDaysUTC } from "@/lib/timezone";
import { Prisma } from "@prisma/client";
import type { MedicationAdministration } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import {
  logDoseSchema,
  type LogDoseInput,
} from "@/lib/schemas/medication-administration";

/** A calendar date is validated before deriving its two Sydney midnights. */
function dayRange(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw ApiError.badRequest("date must be YYYY-MM-DD");
  const day = new Date(`${date}T00:00:00Z`);
  if (
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== date
  ) {
    throw ApiError.badRequest("Invalid date");
  }
  return {
    start: serviceMidnight(day),
    end: serviceMidnight(addDaysUTC(day, 1)),
  };
}

function assertSameDose(
  existing: MedicationAdministration,
  data: LogDoseInput,
  serviceId: string,
  userId: string,
) {
  // Never disclose another centre's dose, even when its retry key is known.
  if (existing.serviceId !== serviceId) throw ApiError.forbidden();
  if (
    existing.childId !== data.childId ||
    existing.administeredById !== userId ||
    existing.medicationName !== data.medicationName ||
    existing.dose !== data.dose ||
    existing.route !== data.route ||
    existing.administeredAt.getTime() !==
      new Date(data.administeredAt).getTime() ||
    existing.witnessedById !== (data.witnessedById ?? null) ||
    existing.parentConsentUrl !== (data.parentConsentUrl ?? null) ||
    existing.notes !== (data.notes ?? null)
  ) {
    throw ApiError.conflict(
      "This submission has already been used for a different dose. Reload before recording another dose.",
    );
  }
}

const doseInclude = {
  administeredBy: { select: { id: true, name: true, avatar: true } },
  witnessedBy: { select: { id: true, name: true, avatar: true } },
  child: { select: { id: true, firstName: true, surname: true } },
} satisfies Prisma.MedicationAdministrationInclude;

// GET /api/services/[id]/medications?date=YYYY-MM-DD&childId=
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session, id);

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? serviceTodayISO();
  const childId = url.searchParams.get("childId") ?? undefined;
  const { start, end } = dayRange(date);

  const items = await prisma.medicationAdministration.findMany({
    where: {
      serviceId: id,
      administeredAt: { gte: start, lt: end },
      ...(childId ? { childId } : {}),
    },
    orderBy: { administeredAt: "desc" },
    include: {
      administeredBy: { select: { id: true, name: true, avatar: true } },
      witnessedBy: { select: { id: true, name: true, avatar: true } },
      child: { select: { id: true, firstName: true, surname: true } },
    },
  });

  return NextResponse.json({ items, date });
});

// POST /api/services/[id]/medications — log a dose
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session, id);

    const body = await parseJsonBody(req);
    const parsed = logDoseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Offline-resync dedupe — clientMutationId is REQUIRED for medication (unlike
    // reflections/observations). Doses are audit-critical.
    const findReplay = () =>
      prisma.medicationAdministration.findUnique({
        where: { clientMutationId: data.clientMutationId },
        include: doseInclude,
      });
    const existing = await findReplay();
    if (existing) {
      assertSameDose(existing, data, id, session.user.id);
      return NextResponse.json(existing, { status: 200 });
    }

    // Server-side witness enforcement (redundant with Zod — defense in depth).
    if (data.route === "injection" && !data.witnessedById) {
      throw ApiError.badRequest("A witness is required for injection doses");
    }
    if (data.witnessedById && data.witnessedById === session.user.id) {
      throw ApiError.badRequest("Witness must be a different user");
    }

    try {
      const created = await prisma.$transaction(async (tx) => {
        const child = await tx.child.findFirst({
          where: { id: data.childId, serviceId: id },
          select: { id: true },
        });
        if (!child)
          throw ApiError.badRequest("Child not found in this service");

        // If a witness is supplied, confirm they exist.
        if (data.witnessedById) {
          const witness = await tx.user.findUnique({
            where: { id: data.witnessedById },
            select: { id: true },
          });
          if (!witness) throw ApiError.badRequest("Witness not found");
        }

        const dose = await tx.medicationAdministration.create({
          data: {
            childId: data.childId,
            serviceId: id,
            medicationName: data.medicationName,
            dose: data.dose,
            route: data.route,
            administeredAt: new Date(data.administeredAt),
            administeredById: session.user.id,
            witnessedById: data.witnessedById ?? null,
            parentConsentUrl: data.parentConsentUrl ?? null,
            notes: data.notes ?? null,
            clientMutationId: data.clientMutationId,
          },
          include: {
            administeredBy: { select: { id: true, name: true, avatar: true } },
            witnessedBy: { select: { id: true, name: true, avatar: true } },
            child: { select: { id: true, firstName: true, surname: true } },
          },
        });

        await tx.activityLog.create({
          data: {
            userId: session.user.id,
            action: "logged_medication",
            entityType: "MedicationAdministration",
            entityId: dose.id,
            details: {
              serviceId: id,
              childId: dose.childId,
              medicationName: dose.medicationName,
              route: dose.route,
              witnessed: Boolean(dose.witnessedById),
            },
          },
        });

        return dose;
      });

      return NextResponse.json(created, { status: 201 });
    } catch (error) {
      // Two retries can race past the lookup; the unique key picks the winner.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const replay = await findReplay();
        if (replay) {
          assertSameDose(replay, data, id, session.user.id);
          return NextResponse.json(replay, { status: 200 });
        }
      }
      throw error;
    }
  },
  { roles: [...ADMIN_ROLES, "member", "staff"] },
);
