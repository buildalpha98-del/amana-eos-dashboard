import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { ApiError } from "@/lib/api-error";
import { getCentreScope } from "@/lib/centre-scope";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { KNOX_ROLES, assertInScope, scopeWhere } from "../_lib";

const querySchema = z.object({
  serviceId: z.string().trim().min(1).optional(),
  status: z.enum(["open", "committed", "dismissed", "expired"]).default("open"),
});

function statusWhere(status: z.infer<typeof querySchema>["status"], now: Date): Prisma.PendingActionWhereInput {
  switch (status) {
    case "open":
      return { committedAt: null, dismissedAt: null, expiresAt: { gt: now } };
    case "committed":
      return { committedAt: { not: null } };
    case "dismissed":
      return { dismissedAt: { not: null } };
    case "expired":
      return { committedAt: null, dismissedAt: null, expiresAt: { lte: now } };
  }
}

/** GET /api/knox/actions?serviceId=&status=open|committed|dismissed|expired */
export const GET = withApiAuth(
  async (req, session) => {
    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse({
      serviceId: searchParams.get("serviceId") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    if (!parsed.success) throw ApiError.badRequest("Invalid query", parsed.error.flatten());
    const { serviceId, status } = parsed.data;

    const { serviceIds } = await getCentreScope(session);
    let where: Prisma.PendingActionWhereInput = {
      ...statusWhere(status, new Date()),
      ...scopeWhere(serviceIds),
    };
    if (serviceId) {
      assertInScope(serviceIds, serviceId);
      where = { ...where, serviceId };
    }

    const actions = await prisma.pendingAction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ actions });
  },
  { roles: KNOX_ROLES },
);
