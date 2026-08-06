/**
 * Staff injuries and near-misses.
 *
 * Separate from the child incident register on purpose: the fields are
 * different (body part, treatment, workers compensation) and a mixed
 * register is harder to read and impossible to report from.
 *
 * GET reports `notifiableUnreported` — incidents marked notifiable to a
 * regulator that have no notification date. That's the one number worth
 * surfacing: the failure mode here is realising months later that nobody
 * made the call.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { logger } from "@/lib/logger";

const createSchema = z.object({
  staffName: z.string().trim().min(1).max(120),
  userId: z.string().optional(),
  occurredAt: z.string().datetime(),
  incidentType: z
    .enum(["injury", "near_miss", "illness", "property", "other"])
    .default("injury"),
  severity: z.enum(["minor", "moderate", "serious", "notifiable"]).default("minor"),
  location: z.string().trim().max(200).optional(),
  description: z.string().trim().min(1).max(8000),
  bodyPart: z.string().trim().max(120).optional(),
  treatment: z.string().trim().max(4000).optional(),
  witnessNames: z.string().trim().max(400).optional(),
  reportableToAuthority: z.boolean().default(false),
  reportedToAuthorityAt: z.string().datetime().optional(),
  workersCompClaim: z.boolean().default(false),
  followUpRequired: z.boolean().default(false),
});

export const GET = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const rows = await prisma.staffIncidentReport.findMany({
      where: { serviceId: id },
      orderBy: { occurredAt: "desc" },
      take: 100,
      include: {
        reportedBy: { select: { name: true } },
        signedOffBy: { select: { name: true } },
      },
    });

    return NextResponse.json({
      incidents: rows.map((r) => ({
        id: r.id,
        staffName: r.staffName,
        occurredAt: r.occurredAt,
        incidentType: r.incidentType,
        severity: r.severity,
        location: r.location,
        description: r.description,
        bodyPart: r.bodyPart,
        treatment: r.treatment,
        witnessNames: r.witnessNames,
        reportableToAuthority: r.reportableToAuthority,
        reportedToAuthorityAt: r.reportedToAuthorityAt,
        workersCompClaim: r.workersCompClaim,
        followUpRequired: r.followUpRequired,
        followUpCompleted: r.followUpCompleted,
        reportedBy: r.reportedBy?.name ?? null,
        signedOffAt: r.signedOffAt,
        signedOffBy: r.signedOffBy?.name ?? null,
      })),
      // Marked notifiable, never notified. The number nobody tracks.
      notifiableUnreported: rows.filter(
        (r) => r.reportableToAuthority && !r.reportedToAuthorityAt,
      ).length,
      openFollowUps: rows.filter(
        (r) => r.followUpRequired && !r.followUpCompleted,
      ).length,
    });
  },
  // A staff injury register is not for the whole floor to read.
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    const created = await prisma.staffIncidentReport.create({
      data: {
        serviceId: id,
        userId: d.userId ?? null,
        staffName: d.staffName,
        occurredAt: new Date(d.occurredAt),
        incidentType: d.incidentType,
        severity: d.severity,
        location: d.location || null,
        description: d.description,
        bodyPart: d.bodyPart || null,
        treatment: d.treatment || null,
        witnessNames: d.witnessNames || null,
        // A "notifiable" severity IS reportable, whatever the tickbox
        // said — the two disagreeing is how a notification gets missed.
        reportableToAuthority:
          d.reportableToAuthority || d.severity === "notifiable",
        reportedToAuthorityAt: d.reportedToAuthorityAt
          ? new Date(d.reportedToAuthorityAt)
          : null,
        workersCompClaim: d.workersCompClaim,
        followUpRequired: d.followUpRequired,
        reportedById: session!.user.id,
      },
    });

    logger.info("Staff incident recorded", {
      incidentId: created.id,
      serviceId: id,
      severity: d.severity,
      userId: session!.user.id,
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
