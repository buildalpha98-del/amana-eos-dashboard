import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createPolicySchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional(),
  category: z.string().optional(),
  documentUrl: z.string().url().optional(),
  documentId: z.string().optional(),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
  requiresReack: z.boolean().default(true),
});

// GET /api/policies — list policies
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const category = searchParams.get("category");
  const isAdmin = ["owner", "admin"].includes(session!.user.role);

  const where: Record<string, unknown> = { deleted: false };

  // Staff only see published policies
  if (!isAdmin) {
    where.status = "published";
  } else if (status) {
    where.status = status;
  }

  if (category) {
    where.category = category;
  }

  const policies = await prisma.policy.findMany({
    where,
    include: {
      _count: {
        select: { acknowledgements: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(policies);
}

// POST /api/policies — create policy (owner/admin only)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createPolicySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const policy = await prisma.policy.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description || null,
      category: parsed.data.category || null,
      documentUrl: parsed.data.documentUrl || null,
      documentId: parsed.data.documentId || null,
      status: parsed.data.status,
      requiresReack: parsed.data.requiresReack,
      publishedAt:
        parsed.data.status === "published" ? new Date() : null,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "Policy",
      entityId: policy.id,
      details: { title: policy.title, status: policy.status },
    },
  });

  return NextResponse.json(policy, { status: 201 });
}
