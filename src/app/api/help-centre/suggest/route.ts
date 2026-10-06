/**
 * GET /api/help-centre/suggest?q=
 *
 * The staff side of the parent-question library: Help Centre answers
 * matching a parent's message, for one-click insertion into a reply.
 * Includes UNPUBLISHED articles (flagged) — that is where staff-only
 * policy answers live, never shown to parents.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { excerpt, suggestArticles } from "@/lib/help-suggest";

const querySchema = z.object({ q: z.string().max(5000).default("") });

export const GET = withApiAuth(async (req) => {
  const { q } = querySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );

  const articles = await prisma.helpArticle.findMany({
    select: {
      id: true,
      title: true,
      slug: true,
      body: true,
      published: true,
      category: { select: { name: true, published: true } },
    },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    take: 500,
  });

  // An empty search lists everything (browse mode); otherwise rank. A lower
  // bar than the parent side — staff are choosing, not being interrupted.
  const picked = q.trim()
    ? suggestArticles(articles, q, { limit: 8, minScore: 1 })
    : articles.slice(0, 50);

  return NextResponse.json({
    answers: picked.map((a) => ({
      id: a.id,
      title: a.title,
      slug: a.slug,
      body: a.body,
      excerpt: excerpt(a.body),
      category: a.category?.name ?? null,
      // Visible to parents only when both the article and its category are.
      parentVisible: a.published === true && a.category?.published === true,
    })),
  });
});
