/**
 * /api/amana-handbook/content
 *
 * Owner/admin-editable content overrides for the Educators Induction
 * Handbook (`/tools/handbook`). Singleton row keyed by id="singleton",
 * matching the AmanaWayContent shape.
 *
 * GET   — any authenticated dashboard user
 * PATCH — owner/admin only
 *
 * Body shape: { data: Record<string, string> }
 *   Replaces the stored map atomically; clients send the full overrides
 *   map. 200 KB cap to keep the row bounded.
 *
 * 2026-05-16.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const SINGLETON_ID = "singleton";
const MAX_BYTES = 200_000;

const updateSchema = z.object({
  data: z.record(z.string(), z.string()),
});

export const GET = withApiAuth(async () => {
  const row = await prisma.amanaHandbookContent.findUnique({
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

    const row = await prisma.amanaHandbookContent.upsert({
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
        action: "update_amana_handbook_content",
        entityType: "AmanaHandbookContent",
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
