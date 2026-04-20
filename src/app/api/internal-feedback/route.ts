import { NextRequest, NextResponse } from "next/server";
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
// GET /api/internal-feedback — list feedback (admin+ only)
export const GET = withApiAuth(async (req, session) => {
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
