import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

type RouteCtx = { params: Promise<{ id: string }> };

export const DELETE = withApiAuth(
  async (_req, _session, ctx) => {
    const { id } = await (ctx as RouteCtx).params;
    const existing = await prisma.schoolLiaisonLog.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound("Log not found");

    await prisma.schoolLiaisonLog.delete({ where: { id } });
    return NextResponse.json({ deleted: true });
  },
  { roles: ["marketing", "owner"] },
);
