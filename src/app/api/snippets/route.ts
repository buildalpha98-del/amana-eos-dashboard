import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const createSchema = z.object({
  title: z.string().min(1).max(200),
  summary: z.string().min(1).max(2000),
  category: z.string().max(50).optional(),
  priority: z.enum(["low", "normal", "high"]).optional(),
  expiresAt: z.string().datetime().optional(),
});

export const GET = withApiAuth(async (req, session) => {
const userId = session!.user.id;

  const totalUsers = await prisma.user.count({ where: { active: true } });

  const snippets = await prisma.infoSnippet.findMany({
    where: {
      active: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
    },
    include: {
      acknowledgements: {
        select: { userId: true },
      },
      createdBy: {
        select: { id: true, name: true },
      },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const result = snippets.map((s) => ({
    id: s.id,
    title: s.title,
    summary: s.summary,
    category: s.category,
    priority: s.priority,
    expiresAt: s.expiresAt,
    createdBy: s.createdBy,
    createdAt: s.createdAt,
    acknowledged: s.acknowledgements.some((a) => a.userId === userId),
    totalAcks: s.acknowledgements.length,
    totalUsers,
  }));

  return NextResponse.json(result);
});

export const POST = withApiAuth(async (req, session) => {
const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const snippet = await prisma.infoSnippet.create({
    data: {
      title: parsed.data.title,
      summary: parsed.data.summary,
      category: parsed.data.category ?? null,
      priority: parsed.data.priority ?? "normal",
      expiresAt: parsed.data.expiresAt
        ? new Date(parsed.data.expiresAt)
        : null,
      createdById: session!.user.id,
    },
  });

  return NextResponse.json(snippet, { status: 201 });
});
