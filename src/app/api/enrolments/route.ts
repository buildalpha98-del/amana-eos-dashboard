import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { serviceScopeFilter } from "@/lib/authz-scope";
import { searchEnrolmentIds } from "@/lib/enrolment-search";

const DEFAULT_LIMIT = 50;

/**
 * Each row carries the family's full JSON (parents, children, medical,
 * documents), so a page is heavy. 200 is generous for a screenful and keeps a
 * hand-typed `?limit=100000` from trying to serialise the whole table.
 */
const MAX_LIMIT = 200;

function intParam(
  raw: string | null,
  fallback: number,
  min: number,
  max: number,
): number {
  const n = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, min), max);
}

export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || undefined;
  const search = (searchParams.get("search") ?? "").trim();
  const limit = intParam(searchParams.get("limit"), DEFAULT_LIMIT, 1, MAX_LIMIT);
  const offset = intParam(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  // Centre-scope: non-admins only see their own service's submissions
  // (child/parent DOB, address, CRN, medical); admins see all centres.
  const scope = serviceScopeFilter(session);

  /*
   * Search runs in SQL so it reaches EVERY submission, not just the page the
   * client happens to be holding. It used to be a browser-side filter over the
   * newest 100 rows, which meant an older family's form could not be found at
   * all — the page reported "no enrolments match" and looked like data loss.
   */
  let searchScope: { id: { in: string[] } } | undefined;
  if (search) {
    const ids = await searchEnrolmentIds(
      search,
      "serviceId" in scope ? scope.serviceId : undefined,
    );
    if (ids.length === 0) {
      return NextResponse.json({
        submissions: [],
        total: 0,
        counts: { all: 0 },
        unplaced: 0,
        limit,
        offset,
      });
    }
    searchScope = { id: { in: ids } };
  }

  // `base` deliberately excludes the status tab: the tab counts have to
  // describe the whole filtered set, otherwise "Submitted 12" just means
  // twelve of the rows on this page, and shrinks as you page forward.
  const base = { ...scope, ...searchScope };
  const where = { ...base, ...(status ? { status } : {}) };

  const [submissions, total, byStatus, unplaced] = await Promise.all([
    prisma.enrolmentSubmission.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.enrolmentSubmission.count({ where }),
    prisma.enrolmentSubmission.groupBy({
      by: ["status"],
      where: base,
      _count: { _all: true },
    }),
    /*
     * Children on no roll and no invoice. Counted here for the same reason as
     * the status tabs: a backlog that only counts the current page understates
     * itself, and this banner exists precisely to be alarming when it should be.
     *
     * Archived submissions are excluded — they have been dealt with, and a
     * banner that can never reach zero stops being read.
     */
    prisma.enrolmentSubmission.count({
      where: { ...base, serviceId: null, status: { not: "archived" } },
    }),
  ]);

  const counts: Record<string, number> = { all: 0 };
  for (const row of byStatus) {
    counts[row.status] = row._count._all;
    counts.all += row._count._all;
  }

  return NextResponse.json({ submissions, total, counts, unplaced, limit, offset });
});
