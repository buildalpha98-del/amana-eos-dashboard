import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/marketing/posts/:id/revisions
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const { id } = await params;

  const revisions = await prisma.marketingPostRevision.findMany({
    where: { postId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      user: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json(revisions);
}
