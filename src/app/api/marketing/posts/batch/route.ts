import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const batchSchema = z.object({
  postIds: z.array(z.string()).min(1, "At least one post ID is required"),
  action: z.enum([
    "status_change",
    "assign_campaign",
    "reschedule",
    "delete",
    "duplicate_to_centres",
  ]),
  status: z
    .enum(["draft", "in_review", "approved", "scheduled", "published"])
    .optional(),
  campaignId: z.string().optional(),
  scheduledDate: z.coerce.date().optional(),
  serviceIds: z.array(z.string()).optional(),
});

// POST /api/marketing/posts/batch — batch operations on posts
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  const body = await req.json();
  const parsed = batchSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { postIds, action } = parsed.data;
  let success = 0;
  let failed = 0;
  const errors: { postId: string; error: string }[] = [];

  try {
    switch (action) {
      case "status_change": {
        if (!parsed.data.status) {
          return NextResponse.json(
            { error: "status is required for status_change action" },
            { status: 400 }
          );
        }
        const result = await prisma.marketingPost.updateMany({
          where: { id: { in: postIds }, deleted: false },
          data: { status: parsed.data.status },
        });
        success = result.count;
        failed = postIds.length - result.count;
        break;
      }

      case "assign_campaign": {
        if (!parsed.data.campaignId) {
          return NextResponse.json(
            { error: "campaignId is required for assign_campaign action" },
            { status: 400 }
          );
        }
        const result = await prisma.marketingPost.updateMany({
          where: { id: { in: postIds }, deleted: false },
          data: { campaignId: parsed.data.campaignId },
        });
        success = result.count;
        failed = postIds.length - result.count;
        break;
      }

      case "reschedule": {
        if (!parsed.data.scheduledDate) {
          return NextResponse.json(
            { error: "scheduledDate is required for reschedule action" },
            { status: 400 }
          );
        }
        const result = await prisma.marketingPost.updateMany({
          where: { id: { in: postIds }, deleted: false },
          data: { scheduledDate: parsed.data.scheduledDate },
        });
        success = result.count;
        failed = postIds.length - result.count;
        break;
      }

      case "delete": {
        const result = await prisma.marketingPost.updateMany({
          where: { id: { in: postIds }, deleted: false },
          data: { deleted: true },
        });
        success = result.count;
        failed = postIds.length - result.count;
        break;
      }

      case "duplicate_to_centres": {
        if (!parsed.data.serviceIds || parsed.data.serviceIds.length === 0) {
          return NextResponse.json(
            { error: "serviceIds is required for duplicate_to_centres action" },
            { status: 400 }
          );
        }
        const serviceIds = parsed.data.serviceIds;

        // Fetch all source posts
        const sourcePosts = await prisma.marketingPost.findMany({
          where: { id: { in: postIds }, deleted: false },
        });

        for (const sourcePost of sourcePosts) {
          try {
            for (const serviceId of serviceIds) {
              const clone = await prisma.marketingPost.create({
                data: {
                  title: sourcePost.title,
                  platform: sourcePost.platform,
                  content: sourcePost.content,
                  notes: sourcePost.notes,
                  designLink: sourcePost.designLink,
                  pillar: sourcePost.pillar,
                  assigneeId: sourcePost.assigneeId,
                  campaignId: sourcePost.campaignId,
                  recurring: sourcePost.recurring,
                  status: "draft",
                  clonedFromId: sourcePost.id,
                  likes: 0,
                  comments: 0,
                  shares: 0,
                  reach: 0,
                },
              });

              await prisma.marketingPostService.create({
                data: {
                  postId: clone.id,
                  serviceId,
                },
              });
            }
            success++;
          } catch (err) {
            failed++;
            errors.push({
              postId: sourcePost.id,
              error: err instanceof Error ? err.message : "Unknown error",
            });
          }
        }

        // Count posts that were not found
        const notFoundCount = postIds.length - sourcePosts.length;
        failed += notFoundCount;
        break;
      }
    }
  } catch (err) {
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Batch operation failed",
      },
      { status: 500 }
    );
  }

  // Log activity
  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "batch_update",
      entityType: "MarketingPost",
      entityId: postIds[0],
      details: {
        action,
        postIds,
        success,
        failed,
      },
    },
  });

  return NextResponse.json({ success, failed, errors });
}
