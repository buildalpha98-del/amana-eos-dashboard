/**
 * Observations that never went anywhere.
 *
 * NQS Element 1.3 is the assessment-and-planning cycle, and it's where
 * services most often sit on "Working Towards" — not because nobody
 * observes, but because nothing shows what was DONE about it.
 *
 * OWNA has the same linking feature and it's under-used, because it
 * relies on an educator remembering a menu item exists and going to find
 * the original post. This is the other half: the system says which
 * observations are still open, so following up is prompted rather than
 * remembered.
 *
 * Deliberately quiet: only published observations, only ones old enough
 * to reasonably have been acted on, newest first, capped.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { assertServiceAccess } from "@/lib/authz-scope";

/**
 * How long an observation sits before it counts as unanswered. Two weeks
 * is roughly a programming cycle — long enough that "we haven't got to
 * it yet" isn't the explanation, short enough to still be actionable.
 */
export const FOLLOW_UP_AFTER_DAYS = 14;
/** And how far back to look: older than this and the moment has passed. */
const LOOK_BACK_DAYS = 90;

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session as never, id);

  const now = Date.now();
  const olderThan = new Date(now - FOLLOW_UP_AFTER_DAYS * 86400_000);
  const notBefore = new Date(now - LOOK_BACK_DAYS * 86400_000);

  const posts = await prisma.parentPost.findMany({
    where: {
      serviceId: id,
      type: "observation",
      status: "published",
      // A follow-up is itself an answer to something; it doesn't need one.
      extendsPostId: null,
      createdAt: { lte: olderThan, gte: notBefore },
      // Nothing has been written off the back of it.
      extensions: { none: {} },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: {
      id: true,
      title: true,
      createdAt: true,
      mtopOutcomes: true,
      tags: {
        select: {
          child: { select: { id: true, firstName: true } },
        },
      },
    },
  });

  return NextResponse.json({
    posts: posts.map((p) => ({
      id: p.id,
      title: p.title,
      createdAt: p.createdAt,
      daysAgo: Math.floor((now - p.createdAt.getTime()) / 86400_000),
      mtopOutcomes: p.mtopOutcomes,
      children: p.tags
        .map((t) => t.child?.firstName)
        .filter((n): n is string => Boolean(n)),
    })),
  });
});
