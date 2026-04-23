import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { safeLimit } from "@/lib/pagination";
import { canParentAccessPost } from "@/lib/parent-post-visibility";
import { resolveParentContactForService } from "@/lib/parent-contact";

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

const createBodySchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

export const POST = withParentAuth(async (req, { parent, params }) => {
  const { postId } = (await params) as { postId: string };
  const access = await canParentAccessPost(parent, postId);
  if (!access.post) throw ApiError.notFound("Post not found");
  if (!access.allowed) throw ApiError.forbidden("No access to this post");
  const contact = await resolveParentContactForService(parent, access.post.serviceId);
  if (!contact) throw ApiError.forbidden("No contact record for this service");

  const parsed = createBodySchema.safeParse(await parseJsonBody(req));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid body", parsed.error.flatten());
  }

  const row = await prisma.parentPostComment.create({
    data: {
      postId,
      parentAuthorId: contact.id,
      body: parsed.data.body,
    },
    include: {
      parentAuthor: { select: { firstName: true, lastName: true } },
      staffAuthor: { select: { name: true } },
    },
  });
  return NextResponse.json(serialise(row), { status: 201 });
});
