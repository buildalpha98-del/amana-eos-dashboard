import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(
  async () => {
    const [users, policies] = await Promise.all([
      prisma.user.findMany({
        where: { active: true },
        select: {
          id: true,
          name: true,
          serviceId: true,
          service: { select: { id: true, name: true, code: true } },
        },
        orderBy: [{ service: { name: "asc" } }, { name: "asc" }],
      }),
      prisma.policy.findMany({
        where: { status: "published", deleted: false },
        select: {
          id: true,
          title: true,
          version: true,
          category: true,
          publishedAt: true,
        },
        orderBy: { title: "asc" },
      }),
    ]);

    const userIds = users.map((u) => u.id);
    const policyIds = policies.map((p) => p.id);

    const acks =
      userIds.length === 0 || policyIds.length === 0
        ? []
        : await prisma.policyAcknowledgement.findMany({
            where: {
              userId: { in: userIds },
              policyId: { in: policyIds },
            },
            select: {
              userId: true,
              policyId: true,
              policyVersion: true,
              acknowledgedAt: true,
            },
          });

    const ackMap = new Map<string, Map<string, { policyVersion: number; acknowledgedAt: Date }>>();
    for (const a of acks) {
      if (!ackMap.has(a.userId)) ackMap.set(a.userId, new Map());
      const userMap = ackMap.get(a.userId)!;
      const existing = userMap.get(a.policyId);
      if (!existing || a.policyVersion > existing.policyVersion) {
        userMap.set(a.policyId, { policyVersion: a.policyVersion, acknowledgedAt: a.acknowledgedAt });
      }
    }

    const policyVersionMap = new Map(policies.map((p) => [p.id, p.version]));

    let fullyAcknowledged = 0;
    let partial = 0;
    let none = 0;

    const rows = users.map((u) => {
      const userAcks = ackMap.get(u.id);
      const ackEntries = policies
        .map((p) => {
          const a = userAcks?.get(p.id);
          return a
            ? {
                policyId: p.id,
                policyVersion: a.policyVersion,
                acknowledgedAt: a.acknowledgedAt.toISOString(),
              }
            : null;
        })
        .filter((x): x is { policyId: string; policyVersion: number; acknowledgedAt: string } => x !== null);

      const currentAcks = ackEntries.filter(
        (a) => policyVersionMap.get(a.policyId) === a.policyVersion,
      );
      if (policies.length === 0) {
        fullyAcknowledged++;
      } else if (currentAcks.length === policies.length) {
        fullyAcknowledged++;
      } else if (ackEntries.length === 0) {
        none++;
      } else {
        partial++;
      }

      return {
        userId: u.id,
        userName: u.name,
        serviceName: u.service?.name ?? "Unassigned",
        serviceCode: u.service?.code ?? "",
        acknowledgements: ackEntries,
      };
    });

    return NextResponse.json({
      rows,
      policies: policies.map((p) => ({
        id: p.id,
        title: p.title,
        version: p.version,
        category: p.category,
        publishedAt: p.publishedAt ? p.publishedAt.toISOString() : null,
      })),
      summary: {
        totalStaff: users.length,
        fullyAcknowledged,
        partial,
        none,
      },
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
