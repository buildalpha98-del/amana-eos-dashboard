/**
 * GET /api/documents/staff-folders — admin-only: one virtual folder per
 * staff member holding their personal files (2026-10-08, Daniel: "instead
 * of it being spammed … can they live within folders for each staff").
 *
 * A folder gathers, automatically and with no filing:
 *   - Documents assigned to them (contracts, letters uploaded on /staff)
 *   - Compliance certificates they or an admin uploaded (WWCC, first aid…)
 *   - Their employment contracts
 * Nothing is moved — the folders are a VIEW, so nothing can be mis-filed.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ADMIN_ROLES } from "@/lib/role-permissions";

export const GET = withApiAuth(
  async () => {
    const [docs, certs, contracts] = await Promise.all([
      prisma.document.groupBy({
        by: ["assignedToId"],
        where: { deleted: false, assignedToId: { not: null } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.complianceCertificate.groupBy({
        by: ["userId"],
        where: { userId: { not: null }, fileUrl: { not: null }, supersededAt: null },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
      prisma.employmentContract.groupBy({
        by: ["userId"],
        where: { documentUrl: { not: null } },
        _count: { _all: true },
        _max: { createdAt: true },
      }),
    ]);

    const tally = new Map<string, { documents: number; certificates: number; contracts: number; latest: Date | null }>();
    const bump = (id: string | null, field: "documents" | "certificates" | "contracts", n: number, at: Date | null) => {
      if (!id) return;
      const t = tally.get(id) ?? { documents: 0, certificates: 0, contracts: 0, latest: null };
      t[field] += n;
      if (at && (!t.latest || at > t.latest)) t.latest = at;
      tally.set(id, t);
    };
    for (const d of docs) bump(d.assignedToId, "documents", d._count._all, d._max.createdAt);
    for (const c of certs) bump(c.userId, "certificates", c._count._all, c._max.createdAt);
    for (const c of contracts) bump(c.userId, "contracts", c._count._all, c._max.createdAt);

    const users = await prisma.user.findMany({
      where: { id: { in: [...tally.keys()] }, isCentreAccount: false },
      select: { id: true, name: true, avatar: true, active: true, service: { select: { name: true } } },
    });

    const folders = users
      .map((u) => {
        const t = tally.get(u.id)!;
        return {
          userId: u.id,
          name: u.name,
          avatar: u.avatar,
          active: u.active,
          serviceName: u.service?.name ?? null,
          documents: t.documents,
          certificates: t.certificates,
          contracts: t.contracts,
          total: t.documents + t.certificates + t.contracts,
          latestAt: t.latest,
        };
      })
      .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));

    return NextResponse.json({ folders });
  },
  { roles: [...ADMIN_ROLES] },
);
