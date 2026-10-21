/**
 * GET  /api/services/[id]/stock — the centre's stock & resources list.
 * POST /api/services/[id]/stock — add an item (or update it, by name).
 *
 * Anyone at the centre keeps the list (src/lib/service-stock.ts).
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { stockItemSchema } from "@/lib/service-stock";

type Ctx = { params: Promise<{ id: string }> };

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await (context as unknown as Ctx).params;
  assertServiceAccess(session, id);
  const items = await prisma.stockItem.findMany({
    where: { serviceId: id },
    orderBy: [{ category: "asc" }, { item: "asc" }],
  });
  return NextResponse.json({ items });
});

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context as unknown as Ctx).params;
    assertServiceAccess(session, id);
    const parsed = stockItemSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0]?.message ?? "Invalid item");
    const { item, ...rest } = parsed.data;
    const data = {
      category: rest.category ?? null,
      type: rest.type,
      qtyOnHand: rest.qtyOnHand ?? null,
      unit: rest.unit ?? null,
      reorderAt: rest.reorderAt ?? null,
      notes: rest.notes ?? null,
    };
    const saved = await prisma.stockItem.upsert({
      where: { serviceId_item: { serviceId: id, item } },
      create: { serviceId: id, item, ...data },
      update: data,
    });
    return NextResponse.json({ item: saved }, { status: 201 });
  },
  { rateLimit: { max: 120, windowMs: 60_000 } },
);
