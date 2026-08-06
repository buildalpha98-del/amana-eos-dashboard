/**
 * Headcounts and evacuation drills for a service.
 *
 * GET  → the register, newest first, filterable by kind and date range.
 *        Also reports how long it has been since the last drill, because
 *        that is the number an assessor asks for and nobody tracks.
 * POST → record a count. Educators can record one; only a coordinator or
 *        above can counter-sign it (see PATCH).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { assertServiceAccess } from "@/lib/authz-scope";
import { programmeName } from "@/lib/programme-names";
import type { SessionType } from "@prisma/client";

export const HEADCOUNT_KINDS = [
  "head_count",
  "evacuation_drill",
  "excursion_head_count",
  "bus_run",
] as const;

const SESSION_TYPES = [
  "bsc",
  "asc",
  "vc",
  "extra1",
  "extra2",
  "extra3",
  "extra4",
] as const;

const createSchema = z.object({
  kind: z.enum(HEADCOUNT_KINDS).default("head_count"),
  /** Defaults to now. Accepted so a count taken on paper can be entered later. */
  conductedAt: z.string().datetime().optional(),
  sessionType: z.enum(SESSION_TYPES).optional(),
  excursionId: z.string().optional(),
  childrenCount: z.number().int().min(0).max(1000),
  staffCount: z.number().int().min(0).max(500).default(0),
  visitorsCount: z.number().int().min(0).max(500).default(0),
  childIds: z.array(z.string()).max(1000).optional(),
  evacuationSeconds: z.number().int().min(0).max(7200).optional(),
  issuesIdentified: z.string().trim().max(4000).optional(),
  notes: z.string().trim().max(4000).optional(),
});

export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const limitParam = Number(url.searchParams.get("limit"));
  const limit =
    Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 200) : 50;

  const rows = await prisma.serviceHeadcount.findMany({
    where: {
      serviceId: id,
      ...(kind && (HEADCOUNT_KINDS as readonly string[]).includes(kind)
        ? { kind }
        : {}),
    },
    orderBy: { conductedAt: "desc" },
    take: limit,
    include: {
      conductedBy: { select: { name: true } },
      signedOffBy: { select: { name: true } },
      excursion: { select: { id: true, title: true } },
    },
  });

  // Days since the last drill — the one figure an assessor asks for.
  const lastDrill = await prisma.serviceHeadcount.findFirst({
    where: { serviceId: id, kind: "evacuation_drill" },
    orderBy: { conductedAt: "desc" },
    select: { conductedAt: true },
  });
  const daysSinceLastDrill = lastDrill
    ? Math.floor(
        (Date.now() - lastDrill.conductedAt.getTime()) / (1000 * 60 * 60 * 24),
      )
    : null;

  return NextResponse.json({
    headcounts: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      conductedAt: r.conductedAt,
      sessionType: r.sessionType,
      programmeName: r.sessionType ? programmeName(r.sessionType) : null,
      childrenCount: r.childrenCount,
      staffCount: r.staffCount,
      visitorsCount: r.visitorsCount,
      totalPeople: r.childrenCount + r.staffCount + r.visitorsCount,
      evacuationSeconds: r.evacuationSeconds,
      issuesIdentified: r.issuesIdentified,
      notes: r.notes,
      conductedBy: r.conductedBy?.name ?? null,
      signedOffAt: r.signedOffAt,
      signedOffBy: r.signedOffBy?.name ?? null,
      excursion: r.excursion,
    })),
    daysSinceLastDrill,
  });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;

    // A count attached to another centre's excursion would file the
    // evidence against the wrong service.
    if (d.excursionId) {
      const exc = await prisma.serviceExcursion.findUnique({
        where: { id: d.excursionId },
        select: { serviceId: true },
      });
      if (!exc || exc.serviceId !== id) {
        throw ApiError.badRequest("That excursion isn't at this service");
      }
    }

    // Counting more children than were named is a typo worth catching at
    // the point of entry, not in an audit six months later.
    if (d.childIds && d.childIds.length > d.childrenCount) {
      throw ApiError.badRequest(
        `You named ${d.childIds.length} children but counted ${d.childrenCount}.`,
      );
    }

    const created = await prisma.serviceHeadcount.create({
      data: {
        serviceId: id,
        kind: d.kind,
        conductedAt: d.conductedAt ? new Date(d.conductedAt) : new Date(),
        sessionType: (d.sessionType as SessionType) ?? null,
        excursionId: d.excursionId ?? null,
        childrenCount: d.childrenCount,
        staffCount: d.staffCount,
        visitorsCount: d.visitorsCount,
        childIds: d.childIds ?? [],
        evacuationSeconds: d.evacuationSeconds ?? null,
        issuesIdentified: d.issuesIdentified || null,
        notes: d.notes || null,
        conductedById: session!.user.id,
      },
    });

    logger.info("Headcount recorded", {
      headcountId: created.id,
      serviceId: id,
      kind: d.kind,
      userId: session!.user.id,
    });

    return NextResponse.json(created, { status: 201 });
  },
  // Educators take headcounts. That's the whole point of them.
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
