import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { logDoseSchema } from "@/lib/schemas/medication-administration";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

function ensureServiceAccess(
  role: string,
  userServiceId: string | null | undefined,
  serviceId: string,
) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

/**
 * Midnight → midnight+24h for a given YYYY-MM-DD date in the server's local
 * (Sydney) timezone. Good enough for "today's due" slice — matches the pattern
 * used by attendance routes.
 */
function dayRange(date?: string) {
  const base = date ? new Date(date) : new Date();
  const start = new Date(
    base.getFullYear(),
    base.getMonth(),
    base.getDate(),
    0,
    0,
    0,
    0,
  );
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start, end };
}

// GET /api/services/[id]/medications?date=YYYY-MM-DD&childId=
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const url = new URL(req.url);
  const date = url.searchParams.get("date") ?? undefined;
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

  // Echo back the caller's date string when provided — the server's local
  // date computation is only used to build the SQL window, not to mutate the
  // caller's intended "day."
  const todayLocal = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  return NextResponse.json({
    items,
    date: date ?? todayLocal,
  });
});

// POST /api/services/[id]/medications — log a dose
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    ensureServiceAccess(session.user.role, session.user.serviceId, id);

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
    const existing = await prisma.medicationAdministration.findUnique({
      where: { clientMutationId: data.clientMutationId },
      include: {
        administeredBy: { select: { id: true, name: true, avatar: true } },
        witnessedBy: { select: { id: true, name: true, avatar: true } },
        child: { select: { id: true, firstName: true, surname: true } },
      },
    });
    if (existing) return NextResponse.json(existing, { status: 200 });

    // Server-side witness enforcement (redundant with Zod — defense in depth).
    if (data.route === "injection" && !data.witnessedById) {
      throw ApiError.badRequest("A witness is required for injection doses");
    }
    if (data.witnessedById && data.witnessedById === session.user.id) {
      throw ApiError.badRequest("Witness must be a different user");
    }

    const created = await prisma.$transaction(async (tx) => {
      const child = await tx.child.findFirst({
        where: { id: data.childId, serviceId: id },
        select: { id: true },
      });
      if (!child) throw ApiError.badRequest("Child not found in this service");

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
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
