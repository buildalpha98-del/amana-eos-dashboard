import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updatePolicySchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  documentUrl: z.string().url().nullable().optional(),
  documentId: z.string().nullable().optional(),
  status: z.enum(["draft", "published", "archived"]).optional(),
  requiresReack: z.boolean().optional(),
  content: z.string().optional(), // track if content changed
});

// GET /api/policies/[id] — policy detail + acknowledgement stats
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { id } = await params;

  const policy = await prisma.policy.findUnique({
    where: { id, deleted: false },
    include: {
      acknowledgements: {
        select: {
          id: true,
          userId: true,
          policyVersion: true,
          acknowledgedAt: true,
          user: { select: { id: true, name: true, email: true, avatar: true } },
        },
      },
    },
  });

  if (!policy) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  // Calculate acknowledgement stats
  const totalStaff = await prisma.user.count({
    where: { active: true },
  });

  // Count users who acknowledged at the current version
  const acknowledgedCount = await prisma.policyAcknowledgement.count({
    where: {
      policyId: id,
      policyVersion: policy.version,
    },
  });

  const pendingCount = totalStaff - acknowledgedCount;

  return NextResponse.json({
    ...policy,
    stats: {
      totalStaff,
      acknowledgedCount,
      pendingCount,
    },
  });
}

// PATCH /api/policies/[id] — update policy (owner/admin only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.policy.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  const body = await req.json();
  const parsed = updatePolicySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};

  if (parsed.data.title !== undefined) data.title = parsed.data.title;
  if (parsed.data.category !== undefined) data.category = parsed.data.category;
  if (parsed.data.documentUrl !== undefined)
    data.documentUrl = parsed.data.documentUrl;
  if (parsed.data.documentId !== undefined)
    data.documentId = parsed.data.documentId;
  if (parsed.data.requiresReack !== undefined)
    data.requiresReack = parsed.data.requiresReack;

  // If content or description changed, increment version
  const contentChanged =
    parsed.data.description !== undefined &&
    parsed.data.description !== existing.description;

  if (parsed.data.description !== undefined)
    data.description = parsed.data.description;

  if (contentChanged || parsed.data.content !== undefined) {
    data.version = existing.version + 1;
  }

  // Handle status transitions
  if (parsed.data.status !== undefined) {
    data.status = parsed.data.status;
    if (parsed.data.status === "published" && !existing.publishedAt) {
      data.publishedAt = new Date();
    }
  }

  const policy = await prisma.policy.update({
    where: { id },
    data,
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "Policy",
      entityId: id,
      details: {
        fields: Object.keys(data),
        versionBumped: !!data.version,
      },
    },
  });

  return NextResponse.json(policy);
}

// DELETE /api/policies/[id] — soft delete (owner/admin only)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.policy.findUnique({
    where: { id, deleted: false },
  });

  if (!existing) {
    return NextResponse.json({ error: "Policy not found" }, { status: 404 });
  }

  await prisma.policy.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "Policy",
      entityId: id,
      details: { title: existing.title },
    },
  });

  return NextResponse.json({ success: true });
}
