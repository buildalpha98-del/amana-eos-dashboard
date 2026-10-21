/**
 * PATCH  /api/services/[id]/stock/[itemId] — change an item (quantity, reorder level…).
 * DELETE /api/services/[id]/stock/[itemId] — take it off the list.
 */
import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { stockItemSchema } from "@/lib/service-stock";

type Ctx = { params: Promise<{ id: string; itemId: string }> };

async function load(ctx: unknown, session: Parameters<typeof assertServiceAccess>[0]) {
  const { id, itemId } = await (ctx as Ctx).params;
  assertServiceAccess(session, id);
  const row = await prisma.stockItem.findUnique({ where: { id: itemId }, select: { id: true, serviceId: true } });
  if (!row || row.serviceId !== id) throw ApiError.notFound("Item not found");
  return row;
}

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const row = await load(context, session);
    const parsed = stockItemSchema.partial().safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid item");
    try {
      const item = await prisma.stockItem.update({ where: { id: row.id }, data: parsed.data });
      return NextResponse.json({ item });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw ApiError.conflict("There's already an item with that name on this list");
      }
      throw err;
    }
  },
  { rateLimit: { max: 240, windowMs: 60_000 } },
);

export const DELETE = withApiAuth(async (_req, session, context) => {
  const row = await load(context, session);
  await prisma.stockItem.delete({ where: { id: row.id } });
  return NextResponse.json({ ok: true });
});
