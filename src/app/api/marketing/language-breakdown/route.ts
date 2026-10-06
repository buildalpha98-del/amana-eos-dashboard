/**
 * GET /api/marketing/language-breakdown?serviceId=
 *
 * Which languages families at each centre want to hear from us in —
 * active PRIMARY carers (one per family) grouped by preferredLanguage.
 * Tells marketing which languages to produce material in, per school.
 * "Not recorded" is reported, never hidden: a centre where most families
 * haven't told us is a different story from one that's all English.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(
  async (req) => {
    const serviceId = new URL(req.url).searchParams.get("serviceId") || undefined;

    const [groups, services] = await Promise.all([
      prisma.centreContact.groupBy({
        by: ["serviceId", "preferredLanguage"],
        where: {
          status: "active",
          OR: [{ parentRole: "primary" }, { parentRole: null }],
          ...(serviceId ? { serviceId } : {}),
        },
        _count: { _all: true },
      }),
      prisma.service.findMany({
        where: { status: "active", ...(serviceId ? { id: serviceId } : {}) },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
    ]);

    const centres = services.map((svc) => {
      const rows = groups.filter((g) => g.serviceId === svc.id);
      const total = rows.reduce((n, r) => n + r._count._all, 0);
      const unknown = rows
        .filter((r) => !r.preferredLanguage)
        .reduce((n, r) => n + r._count._all, 0);
      const languages = rows
        .filter((r) => r.preferredLanguage)
        .map((r) => ({ language: r.preferredLanguage as string, families: r._count._all }))
        .sort((a, b) => b.families - a.families);
      return { serviceId: svc.id, name: svc.name, total, unknown, languages };
    });

    // Org-wide totals across the centres returned.
    const overall = new Map<string, number>();
    for (const c of centres) {
      for (const l of c.languages) overall.set(l.language, (overall.get(l.language) ?? 0) + l.families);
    }

    return NextResponse.json({
      centres,
      overall: [...overall.entries()]
        .map(([language, families]) => ({ language, families }))
        .sort((a, b) => b.families - a.families),
    });
  },
  { roles: ["owner", "head_office", "admin", "marketing"] },
);
