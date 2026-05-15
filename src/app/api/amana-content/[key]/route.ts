/**
 * GET /api/amana-content/[key]   — any authed user
 * PATCH /api/amana-content/[key] — owner/admin only
 *
 * `data` is a flat Record<string, string> of override values produced by
 * `<E k="...">` / `<EImg k="...">` wrappers inside the panel components.
 * Missing keys fall back to the hardcoded defaults inside each wrapper,
 * so an empty row yields byte-identical rendering to the original JSX.
 *
 * 2026-05-15: Amana Way editable content + Educators Handbook embed.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import type { Role } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";

const EDIT_ROLES: Role[] = ["owner", "admin"];

const ALLOWED_KEYS = new Set(["amana-way", "amana-handbook"]);

type RouteCtx = { params: Promise<{ key: string }> };

const PatchSchema = z.object({
  data: z.record(z.string(), z.string().max(20_000)),
});

async function getKeyFromContext(context: unknown): Promise<string> {
  const params = await (context as RouteCtx).params;
  const key = params?.key ?? "";
  if (!ALLOWED_KEYS.has(key)) {
    throw ApiError.notFound(`Unknown amana-content key: ${key}`);
  }
  return key;
}

export const GET = withApiAuth(async (_req, _session, context) => {
  const key = await getKeyFromContext(context);
  const row = await prisma.amanaContent.findUnique({
    where: { key },
    select: { key: true, data: true, updatedAt: true, updatedById: true },
  });
  return NextResponse.json({
    key,
    data: (row?.data as Record<string, string> | null) ?? {},
    updatedAt: row?.updatedAt ?? null,
    updatedById: row?.updatedById ?? null,
  });
});

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const key = await getKeyFromContext(context);
    const body = await parseJsonBody(req);
    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid body", parsed.error.flatten());
    }

    const row = await prisma.amanaContent.upsert({
      where: { key },
      create: {
        key,
        data: parsed.data.data,
        updatedById: session.user?.id ?? null,
      },
      update: {
        data: parsed.data.data,
        updatedById: session.user?.id ?? null,
      },
      select: { key: true, data: true, updatedAt: true, updatedById: true },
    });
    return NextResponse.json({
      key: row.key,
      data: row.data,
      updatedAt: row.updatedAt,
      updatedById: row.updatedById,
    });
  },
  { roles: EDIT_ROLES },
);
