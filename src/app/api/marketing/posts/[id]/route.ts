import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const updatePostSchema = z.object({
  title: z.string().min(1).optional(),
  platform: z
    .enum([
      "facebook",
      "instagram",
      "linkedin",
      "email",
      "newsletter",
      "website",
      "flyer",
    ])
    .optional(),
  status: z
    .enum(["draft", "in_review", "approved", "scheduled", "published"])
    .optional(),
  scheduledDate: z.coerce.date().optional().nullable(),
  content: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  designLink: z.string().optional().nullable(),
  pillar: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  campaignId: z.string().optional().nullable(),
  likes: z.number().optional(),
  comments: z.number().optional(),
  shares: z.number().optional(),
  reach: z.number().optional(),
  recurring: z.enum(["none", "weekly", "fortnightly", "monthly"]).optional(),
  serviceIds: z.array(z.string()).optional(),
});

const serviceInclude = {
  services: {
    select: {
      service: {
        select: { id: true, name: true, code: true },
      },
    },
  },
} as const;

// GET /api/marketing/posts/:id — get a single post with related data
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const post = await prisma.marketingPost.findUnique({
    where: { id },
    include: {
      assignee: {
        select: { id: true, name: true, email: true, avatar: true },
      },
      campaign: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      recurringChildren: {
        where: { deleted: false },
        select: { id: true, title: true, scheduledDate: true, status: true },
      },
      ...serviceInclude,
    },
  });

  if (!post || post.deleted) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  return NextResponse.json(post);
}

// PATCH /api/marketing/posts/:id — update a post
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;
  const body = await req.json();
  const parsed = updatePostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const existing = await prisma.marketingPost.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  const { serviceIds, ...updateData } = parsed.data;

  const post = await prisma.marketingPost.update({
    where: { id },
    data: updateData,
  });

  // Sync service join table if serviceIds provided
  if (serviceIds !== undefined) {
    await prisma.marketingPostService.deleteMany({ where: { postId: id } });
    if (serviceIds.length > 0) {
      await prisma.marketingPostService.createMany({
        data: serviceIds.map((serviceId) => ({
          postId: id,
          serviceId,
        })),
      });
    }
  }

  // Re-fetch with all includes
  const fullPost = await prisma.marketingPost.findUnique({
    where: { id },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      campaign: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      ...serviceInclude,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "update",
      entityType: "MarketingPost",
      entityId: id,
      details: parsed.data,
    },
  });

  return NextResponse.json(fullPost);
}

// DELETE /api/marketing/posts/:id — soft delete a post
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const existing = await prisma.marketingPost.findUnique({ where: { id } });
  if (!existing || existing.deleted) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  await prisma.marketingPost.update({
    where: { id },
    data: { deleted: true },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "delete",
      entityType: "MarketingPost",
      entityId: id,
    },
  });

  return NextResponse.json({ success: true });
}
