import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createPostSchema = z.object({
  title: z.string().min(1, "Title is required"),
  platform: z.enum([
    "facebook",
    "instagram",
    "linkedin",
    "email",
    "newsletter",
    "website",
    "flyer",
  ]),
  status: z
    .enum(["draft", "in_review", "approved", "scheduled", "published"])
    .default("draft"),
  scheduledDate: z.coerce.date().optional(),
  content: z.string().optional(),
  notes: z.string().optional(),
  designLink: z.string().optional(),
  pillar: z.string().optional(),
  assigneeId: z.string().optional(),
  campaignId: z.string().optional(),
  likes: z.number().default(0),
  comments: z.number().default(0),
  shares: z.number().default(0),
  reach: z.number().default(0),
  recurring: z.enum(["none", "weekly", "fortnightly", "monthly"]).default("none"),
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

// GET /api/marketing/posts — list posts with optional filters
export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const platform = searchParams.get("platform");
  const assigneeId = searchParams.get("assigneeId");
  const campaignId = searchParams.get("campaignId");
  const serviceId = searchParams.get("serviceId");

  const posts = await prisma.marketingPost.findMany({
    where: {
      deleted: false,
      ...(status ? { status: status as any } : {}),
      ...(platform ? { platform: platform as any } : {}),
      ...(assigneeId ? { assigneeId } : {}),
      ...(campaignId ? { campaignId } : {}),
      ...(serviceId ? { services: { some: { serviceId } } } : {}),
    },
    include: {
      assignee: { select: { id: true, name: true, avatar: true } },
      campaign: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      ...serviceInclude,
    },
    orderBy: [
      { scheduledDate: { sort: "asc", nulls: "first" } },
      { createdAt: "desc" },
    ],
  });

  return NextResponse.json(posts);
}

// POST /api/marketing/posts — create a new post
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Platform-specific content validation — require content for social platforms
  // unless the post is still a draft
  const socialPlatforms = ["instagram", "facebook", "linkedin"];
  if (
    socialPlatforms.includes(parsed.data.platform) &&
    parsed.data.status !== "draft" &&
    !parsed.data.content?.trim()
  ) {
    return NextResponse.json(
      { error: `Content is required for ${parsed.data.platform} posts before publishing.` },
      { status: 400 }
    );
  }

  const {
    title,
    platform,
    status,
    scheduledDate,
    content,
    notes,
    designLink,
    pillar,
    assigneeId,
    campaignId,
    likes,
    comments,
    shares,
    reach,
    recurring,
    serviceIds,
  } = parsed.data;

  const post = await prisma.marketingPost.create({
    data: {
      title,
      platform,
      status,
      scheduledDate: scheduledDate || null,
      content: content || null,
      notes: notes || null,
      designLink: designLink || null,
      pillar: pillar || null,
      assigneeId: assigneeId || null,
      campaignId: campaignId || null,
      likes,
      comments,
      shares,
      reach,
      recurring,
    },
  });

  // Link services if provided
  if (serviceIds && serviceIds.length > 0) {
    await prisma.marketingPostService.createMany({
      data: serviceIds.map((serviceId) => ({
        postId: post.id,
        serviceId,
      })),
    });
  }

  // Generate recurring children when recurring is not "none" and scheduledDate is set
  if (recurring !== "none" && scheduledDate) {
    const offsets: number[] = [];

    if (recurring === "weekly") {
      // 4 additional posts, each 7 days apart
      for (let i = 1; i <= 4; i++) offsets.push(i * 7);
    } else if (recurring === "fortnightly") {
      // 2 additional posts, each 14 days apart
      for (let i = 1; i <= 2; i++) offsets.push(i * 14);
    } else if (recurring === "monthly") {
      // 1 additional post, 30 days later
      offsets.push(30);
    }

    for (const dayOffset of offsets) {
      const childDate = new Date(scheduledDate);
      childDate.setDate(childDate.getDate() + dayOffset);

      const childPost = await prisma.marketingPost.create({
        data: {
          title,
          platform,
          status,
          scheduledDate: childDate,
          content: content || null,
          notes: notes || null,
          designLink: designLink || null,
          pillar: pillar || null,
          assigneeId: assigneeId || null,
          campaignId: campaignId || null,
          likes: 0,
          comments: 0,
          shares: 0,
          reach: 0,
          recurring: "none",
          recurringParentId: post.id,
        },
      });

      // Link services to recurring children too
      if (serviceIds && serviceIds.length > 0) {
        await prisma.marketingPostService.createMany({
          data: serviceIds.map((serviceId) => ({
            postId: childPost.id,
            serviceId,
          })),
        });
      }
    }
  }

  // Re-fetch with all includes
  const fullPost = await prisma.marketingPost.findUnique({
    where: { id: post.id },
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
      action: "create",
      entityType: "MarketingPost",
      entityId: post.id,
      details: { title: post.title, platform: post.platform },
    },
  });

  return NextResponse.json(fullPost, { status: 201 });
}
