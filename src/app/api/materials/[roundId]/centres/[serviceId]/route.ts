/**
 * GET   — one centre's lines (by week) and carts in a round.
 * PATCH — the centre's reply status / notes ({replyStatus, notes}).
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { REPLY_STATUSES } from "@/lib/materials-orders";
import { MATERIALS_ROLES, assertMaterialsCentre } from "@/lib/materials-access";

export const GET = withApiAuth(
  async (_req, session, context) => {
    const { roundId, serviceId } = await context!.params!;
    assertMaterialsCentre(session as never, serviceId);
    const [lines, carts, centre] = await Promise.all([
      prisma.materialsOrderLine.findMany({
        where: { roundId, serviceId },
        orderBy: [{ week: "asc" }, { item: "asc" }],
      }),
      prisma.materialsCart.findMany({ where: { roundId, serviceId }, orderBy: { retailer: "asc" } }),
      prisma.materialsOrderCentre.findUnique({ where: { roundId_serviceId: { roundId, serviceId } } }),
    ]);
    if (!centre) throw ApiError.notFound("This centre isn't in the round");
    return NextResponse.json({ centre, lines, carts });
  },
  { roles: [...MATERIALS_ROLES] },
);

const patchSchema = z
  .object({ replyStatus: z.enum(REPLY_STATUSES).optional(), notes: z.string().max(5000).nullable().optional() })
  .strict();

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { roundId, serviceId } = await context!.params!;
    assertMaterialsCentre(session as never, serviceId);
    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const updated = await prisma.materialsOrderCentre.update({
      where: { roundId_serviceId: { roundId, serviceId } },
      data: {
        ...parsed.data,
        ...(parsed.data.replyStatus === "replied" || parsed.data.replyStatus === "nothing_needed" ? { replyAt: new Date() } : {}),
      },
    });
    return NextResponse.json(updated);
  },
  { roles: [...MATERIALS_ROLES] },
);
