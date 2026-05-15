/**
 * /api/amana-way/content
 *
 * Owner/admin-editable content overrides for the in-app Amana Way
 * handbook. Singleton record keyed by id="singleton".
 *
 * GET   — any authenticated dashboard user
 * PATCH — owner/admin only
 *
 * Body shape: { data: Record<string, string> }
 *   The body REPLACES the stored map atomically — there is no
 *   per-key merge; clients should send the full overrides map.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const SINGLETON_ID = "singleton";
// 200 KB cap on the serialized overrides map — keeps a runaway
// edit from filling the row. The Amana Way handbook content is
// well under 50 KB so this is a generous ceiling.
const MAX_BYTES = 200_000;

const updateSchema = z.object({
  data: z.record(z.string(), z.string()),
});

export const GET = withApiAuth(async () => {
  const row = await prisma.amanaWayContent.findUnique({
    where: { id: SINGLETON_ID },
  });
  const data = (row?.data ?? {}) as Record<string, string>;
  return NextResponse.json({
    data,
    updatedAt: row?.updatedAt ?? null,
    updatedById: row?.updatedById ?? null,
  });
});

export const PATCH = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }

    const serialized = JSON.stringify(parsed.data.data);
    if (serialized.length > MAX_BYTES) {
      throw ApiError.badRequest(
        `Content too large (${serialized.length} bytes, max ${MAX_BYTES}).`,
      );
    }

    const row = await prisma.amanaWayContent.upsert({
      where: { id: SINGLETON_ID },
      create: {
        id: SINGLETON_ID,
        data: parsed.data.data,
        updatedById: session!.user.id,
      },
      update: {
        data: parsed.data.data,
        updatedById: session!.user.id,
      },
    });

    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "update_amana_way_content",
        entityType: "AmanaWayContent",
        entityId: SINGLETON_ID,
        details: { keys: Object.keys(parsed.data.data).length },
      },
    });

    return NextResponse.json({
      data: row.data,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    });
  },
  { roles: ["owner", "admin"], rateLimit: { max: 30, windowMs: 60_000 } },
);
