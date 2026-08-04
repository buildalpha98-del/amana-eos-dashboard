import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { safeLimit } from "@/lib/pagination";
import { canParentAccessPost } from "@/lib/parent-post-visibility";

// ---------------------------------------------------------------------------
// Shared shape
// ---------------------------------------------------------------------------

function shortName(first: string | null | undefined, last: string | null | undefined): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  if (!f && !l) return "Someone";
  if (!l) return f;
  return `${f} ${l.charAt(0)}.`;
}

type CommentRow = {
  id: string;
  body: string;
  createdAt: Date;
  parentAuthor: { firstName: string | null; lastName: string | null } | null;
  staffAuthor: { name: string | null } | null;
};

function serialise(row: CommentRow) {
  if (row.staffAuthor) {
    const name = row.staffAuthor.name ?? "Centre";
    const [first, ...rest] = name.split(" ");
    const last = rest.join(" ");
    return {
      id: row.id,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      authorName: shortName(first, last),
      authorType: "staff" as const,
    };
  }
  return {
    id: row.id,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
    authorName: shortName(row.parentAuthor?.firstName, row.parentAuthor?.lastName),
    authorType: "parent" as const,
  };
}

// ---------------------------------------------------------------------------
// GET — list
// ---------------------------------------------------------------------------

export const GET = withParentAuth(async (req, { parent, params }) => {
  const { postId } = (await params) as { postId: string };
  const access = await canParentAccessPost(parent, postId);
  if (!access.post) throw ApiError.notFound("Post not found");
  if (!access.allowed) throw ApiError.forbidden("No access to this post");

  const url = new URL(req.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const limit = safeLimit(url.searchParams.get("limit"), 20, 50);

  const rows = await prisma.parentPostComment.findMany({
    where: { postId },
    orderBy: { createdAt: "desc" },
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      parentAuthor: { select: { firstName: true, lastName: true } },
      staffAuthor: { select: { name: true } },
    },
  });

  const hasMore = rows.length > limit;
  const items = (hasMore ? rows.slice(0, limit) : rows).map(serialise);
  return NextResponse.json({
    items,
    nextCursor: hasMore ? rows[limit].id : undefined,
  });
});

// ---------------------------------------------------------------------------
// POST — create (parent author)
// ---------------------------------------------------------------------------

/**
 * Parents cannot comment.
 *
 * 2026-08-04: a photo of one child with a comment thread under it is a
 * conversation every other family at the centre can read, and there's no
 * moderation queue behind it. Refused at the API rather than only hidden
 * in the app — the endpoint is reachable whatever the UI renders.
 *
 * The GET above still works, so any comments left before this stay
 * readable rather than silently disappearing.
 */
export const POST = withParentAuth(async () => {
  throw ApiError.forbidden(
    "Comments aren't available. Message head office if you'd like to reply.",
  );
});
