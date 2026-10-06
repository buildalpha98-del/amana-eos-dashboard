/**
 * GET /api/parent/help-suggestions?q=
 *
 * Help Centre answers that match what a parent is typing into a new
 * message, shown before they send. PUBLISHED articles in published
 * categories only — unpublished articles are staff-only answers.
 * Ranking lives in src/lib/help-suggest.ts, shared with the staff picker.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { excerpt, suggestArticles } from "@/lib/help-suggest";

const querySchema = z.object({ q: z.string().max(5000).default("") });

export const GET = withParentAuth(async (req) => {
  const { q } = querySchema.parse(
    Object.fromEntries(new URL(req.url).searchParams),
  );
  if (q.trim().length < 3) return NextResponse.json({ suggestions: [] });

  const articles = await prisma.helpArticle.findMany({
    where: { published: true, category: { is: { published: true } } },
    select: { id: true, title: true, slug: true, body: true },
    take: 500,
  });

  const suggestions = suggestArticles(articles, q, { limit: 3 }).map((a) => ({
    id: a.id,
    title: a.title,
    slug: a.slug,
    body: a.body,
    excerpt: excerpt(a.body),
  }));
  return NextResponse.json({ suggestions });
});
