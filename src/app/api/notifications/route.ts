import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";

const MAX_LIMIT = 50;

const querySchema = z.object({
  cursor: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT).optional(),
});

/**
 * GET /api/notifications
 *
 * Query params:
 * - `unread=true` — only unread rows (unchanged behaviour).
 * - `limit` — page size, 1–50 (default 50, matching the pre-pagination take).
 * - `cursor` — id of the last row from the previous page; returns rows after it.
 *
 * Response is backward compatible with the popover's default call:
 * `{ notifications }` with up to 50 rows, plus an additive `nextCursor`
 * (null when there is no further page).
 */
export const GET = withApiAuth(async (req, session) => {
  const { searchParams } = new URL(req.url);
  const unread = searchParams.get("unread") === "true";

  const parsed = querySchema.safeParse({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    throw ApiError.badRequest(
      "Invalid pagination params",
      parsed.error.flatten().fieldErrors,
    );
  }

  const limit = parsed.data.limit ?? MAX_LIMIT;
  const cursor = parsed.data.cursor;

  // take one extra row to know whether another page exists; `id` is the
  // tie-breaker so the cursor is stable when createdAt values collide.
  const rows = await prisma.userNotification.findMany({
    where: { userId: session.user.id, ...(unread ? { read: false } : {}) },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  });

  const hasMore = rows.length > limit;
  const notifications = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor = hasMore
    ? notifications[notifications.length - 1].id
    : null;

  return NextResponse.json({ notifications, nextCursor });
});
