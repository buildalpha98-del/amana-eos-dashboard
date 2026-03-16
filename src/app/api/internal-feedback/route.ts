import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

// GET /api/internal-feedback — list feedback (admin+ only)
export async function GET(req: NextRequest) {
  const { error } = await requireAuth([
    "owner",
    "head_office",
    "admin",
  ]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (category) where.category = category;

  const feedback = await prisma.internalFeedback.findMany({
    where,
    include: {
      author: { select: { id: true, name: true, email: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ feedback });
}

// POST /api/internal-feedback — create feedback (any authenticated user)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { category, message, screenshotUrl, page } = body as {
    category?: string;
    message?: string;
    screenshotUrl?: string;
    page?: string;
  };

  const validCategories = ["bug", "feature_request", "question", "general"];
  if (!category || !validCategories.includes(category)) {
    return NextResponse.json(
      { error: "Invalid category. Must be one of: bug, feature_request, question, general" },
      { status: 400 },
    );
  }

  if (!message || message.trim().length === 0) {
    return NextResponse.json(
      { error: "Message is required" },
      { status: 400 },
    );
  }

  const feedback = await prisma.internalFeedback.create({
    data: {
      authorId: session!.user.id,
      category,
      message: message.trim(),
      screenshotUrl: screenshotUrl || null,
      page: page || null,
    },
  });

  return NextResponse.json({ feedback }, { status: 201 });
}
