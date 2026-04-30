import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { isNewsletterChaseWeek } from "@/lib/school-terms";

interface ChaseEntryMeta {
  serviceId: string;
  serviceName: string;
  skipped: boolean;
  skipReason: string | null;
}

export const GET = withApiAuth(
  async () => {
    const draft = await prisma.aiTaskDraft.findFirst({
      where: { source: "newsletter-chase", status: "ready" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        content: true,
        metadata: true,
        createdAt: true,
        targetId: true,
      },
    });

    const eligibility = isNewsletterChaseWeek(new Date());

    if (!draft) {
      return NextResponse.json({
        draft: null,
        eligibility,
      });
    }

    const meta = (draft.metadata ?? {}) as Record<string, unknown>;
    const entries = (meta.entries as ChaseEntryMeta[] | undefined) ?? [];

    const sentNextTermIds = new Set<string>();
    if (meta.nextTerm && typeof meta.nextTerm === "object") {
      const nt = meta.nextTerm as { year?: number; number?: number };
      if (nt.year && nt.number) {
        const sentRows = await prisma.schoolComm.findMany({
          where: {
            serviceId: { in: entries.map((e) => e.serviceId) },
            type: "newsletter",
            status: { in: ["sent", "confirmed"] },
            year: nt.year,
            term: nt.number,
          },
          select: { serviceId: true },
        });
        for (const r of sentRows) sentNextTermIds.add(r.serviceId);
      }
    }

    return NextResponse.json({
      draft: {
        id: draft.id,
        title: draft.title,
        content: draft.content,
        targetId: draft.targetId,
        createdAt: draft.createdAt.toISOString(),
        metadata: meta,
        entries: entries.map((e) => ({
          ...e,
          alreadySent: sentNextTermIds.has(e.serviceId),
        })),
      },
      eligibility,
    });
  },
  { roles: ["marketing", "owner"] },
);
