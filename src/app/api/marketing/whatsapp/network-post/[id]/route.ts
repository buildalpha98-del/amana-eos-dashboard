import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("id required");

    const existing = await prisma.whatsAppNetworkPost.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound("Network post not found");

    await prisma.whatsAppNetworkPost.delete({ where: { id } });
    return NextResponse.json({ deleted: id });
  },
  { roles: ["marketing", "owner"] },
);
