/**
 * PATCH /api/materials/lines/[id] — work one order line:
 *   centreHasIt (yes/no/check → re-routes the line), received, notes: the
 *   centre's coordinator or head office;
 *   ordered, unitCost: head office only.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { HAS_IT, routeLine } from "@/lib/materials-orders";
import { MATERIALS_ROLES, assertMaterialsCentre, materialsScope } from "@/lib/materials-access";

const schema = z
  .object({
    centreHasIt: z.enum(HAS_IT).nullable().optional(),
    ordered: z.boolean().optional(),
    received: z.boolean().optional(),
    unitCost: z.number().nonnegative().nullable().optional(),
    notes: z.string().max(5000).nullable().optional(),
  })
  .strict();

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const line = await prisma.materialsOrderLine.findUnique({ where: { id } });
    if (!line) throw ApiError.notFound("Line not found");
    assertMaterialsCentre(session as never, line.serviceId);
    const hq = materialsScope(session as never) === null;
    const v = parsed.data;
    if ((v.ordered !== undefined || v.unitCost !== undefined) && !hq) throw ApiError.forbidden("Ordering is head office's.");
    const now = new Date();
    const updated = await prisma.materialsOrderLine.update({
      where: { id },
      data: {
        ...(v.centreHasIt !== undefined ? { centreHasIt: v.centreHasIt, action: routeLine(v.centreHasIt, line.ifMissing) } : {}),
        ...(v.ordered !== undefined ? { orderedAt: v.ordered ? line.orderedAt ?? now : null } : {}),
        ...(v.received !== undefined ? { receivedAt: v.received ? line.receivedAt ?? now : null } : {}),
        ...(v.unitCost !== undefined ? { unitCost: v.unitCost } : {}),
        ...(v.notes !== undefined ? { notes: v.notes } : {}),
      },
    });
    return NextResponse.json(updated);
  },
  { roles: [...MATERIALS_ROLES] },
);
