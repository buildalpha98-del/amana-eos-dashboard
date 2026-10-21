/**
 * PATCH /api/materials/carts/[id] — head office moves a centre's cart
 * along (ready → checked out → received), or edits its total. Checking it
 * out records the total as that centre's program_materials spend.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { CART_STATUSES, recordCartSpend } from "@/lib/materials-orders";
import { ADMIN_ROLES } from "@/lib/role-permissions";

const schema = z
  .object({
    status: z.enum(CART_STATUSES).optional(),
    total: z.number().nonnegative().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const cart = await prisma.materialsCart.findUnique({ where: { id } });
    if (!cart) throw ApiError.notFound("Cart not found");
    if (cart.budgetItemId && parsed.data.total !== undefined && parsed.data.total !== cart.total)
      throw ApiError.badRequest("This cart's spend is already recorded — edit it in the centre's Budget tab.");
    const checkingOut = parsed.data.status === "checked_out" && !cart.checkedOutAt;
    const updated = await prisma.materialsCart.update({
      where: { id },
      data: { ...parsed.data, ...(checkingOut ? { checkedOutAt: new Date() } : {}) },
    });
    if (updated.status === "checked_out" || updated.status === "received") await recordCartSpend(id, session.user.id);
    return NextResponse.json(await prisma.materialsCart.findUnique({ where: { id } }));
  },
  { roles: [...ADMIN_ROLES] },
);
