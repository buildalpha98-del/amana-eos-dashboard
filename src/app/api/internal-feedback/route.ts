import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const createFeedbackSchema = z.object({
  category: z.enum(["bug", "feature_request", "question", "general"]),
  message: z.string().min(1, "Message is required"),
  screenshotUrl: z.string().optional(),
  page: z.string().optional(),
});
const LIMIT = 50;

// GET /api/internal-feedback — list feedback (admin+ only)
export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const categoryParam = searchParams.get("category");

  const pageRaw = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;

  const where: Record<string, unknown> = {};
  if (statusParam) where.status = statusParam;
  if (categoryParam) where.category = categoryParam;

  const [feedback, total] = await Promise.all([
    prisma.internalFeedback.findMany({
      where,
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * LIMIT,
      take: LIMIT,
    }),
    prisma.internalFeedback.count({ where }),
  ]);

  return NextResponse.json({
    feedback,
    page,
    limit: LIMIT,
    total,
    totalPages: Math.max(1, Math.ceil(total / LIMIT)),
  });
}, { roles: ["owner", "head_office", "admin"] });

// POST /api/internal-feedback — create feedback (any authenticated user)
export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createFeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { category, message, screenshotUrl, page } = parsed.data;

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
});
