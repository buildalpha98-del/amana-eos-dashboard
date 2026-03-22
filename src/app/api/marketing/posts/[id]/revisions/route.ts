import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
// GET /api/marketing/posts/:id/revisions
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  const revisions = await prisma.marketingPostRevision.findMany({
    where: { postId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(revisions);
}, { roles: ["owner", "head_office", "admin", "marketing"] });
