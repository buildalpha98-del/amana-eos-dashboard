import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
import { sendSlackFeedback } from "@/lib/slack-webhook";
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
export const POST = withApiAuth(
  async (req, session) => {
    const body = await parseJsonBody(req);
    const parsed = createFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { category, message, screenshotUrl, page } = parsed.data;

    const feedback = await prisma.internalFeedback.create({
      data: {
        authorId: session.user.id,
        category,
        message: message.trim(),
        screenshotUrl: screenshotUrl || null,
        page: page || null,
      },
    });

    // Fire-and-forget Slack webhook (errors logged, never thrown)
    sendSlackFeedback({
      id: feedback.id,
      authorName: session.user.name ?? session.user.email ?? "Unknown",
      role: session.user.role ?? "unknown",
      category,
      message: message.trim(),
    }).catch(() => {}); // belt-and-braces — helper already swallows

    return NextResponse.json({ feedback }, { status: 201 });
  },
  { rateLimit: { max: 5, windowMs: 60_000 } },
);
