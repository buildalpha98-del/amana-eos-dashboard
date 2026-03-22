import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import {
  decryptToken,
  publishFacebookPost,
  createInstagramContainer,
  publishInstagramMedia,
} from "@/lib/meta";
import { withApiHandler } from "@/lib/api-handler";

const PLATFORMS = ["instagram", "facebook", "both"] as const;

const postSchema = z.object({
  caption: z
    .string()
    .min(1, "Caption is required")
    .max(2200, "Caption must be under 2200 characters (Instagram limit)"),
  imageUrl: z.string().url("imageUrl must be a valid URL").optional().nullable(),
  scheduledAt: z.string().min(1, "scheduledAt is required"),
  hashtags: z.array(z.string()).max(30, "Max 30 hashtags").optional(),
});

const socialScheduleSchema = z.object({
  serviceCode: z.string().min(1, "serviceCode is required"),
  platform: z.enum([...PLATFORMS]),
  posts: z
    .array(postSchema)
    .min(1, "At least 1 post is required")
    .max(10, "Maximum 10 posts per request"),
});

/**
 * POST /api/cowork/social/schedule
 *
 * Schedule Instagram + Facebook posts via Meta Graph API.
 * Scope required: social:write
 */
export const POST = withApiHandler(async (req) => {
  // 1. Authenticate
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  // 3. Validate body
  const body = await req.json();
  const parsed = socialScheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  const { serviceCode, platform, posts } = parsed.data;

  // Instagram requires images for every post
  if (platform === "instagram" || platform === "both") {
    const missingImage = posts.find((p) => !p.imageUrl);
    if (missingImage) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Instagram requires an image for every post. Please provide imageUrl for all posts.",
        },
        { status: 400 },
      );
    }
  }

  // 4. Look up SocialAccount for this centre
  const account = await prisma.socialAccount.findUnique({
    where: { serviceCode },
  });

  if (!account) {
    return NextResponse.json(
      {
        success: false,
        error: `No social account linked for service code "${serviceCode}"`,
      },
      { status: 404 },
    );
  }

  // Validate account has required page/IG IDs
  const needsFacebook =
    platform === "facebook" || platform === "both";
  const needsInstagram =
    platform === "instagram" || platform === "both";

  if (needsFacebook && !account.facebookPageId) {
    return NextResponse.json(
      {
        success: false,
        error: `Social account for "${serviceCode}" has no Facebook page linked`,
      },
      { status: 400 },
    );
  }

  if (needsInstagram && !account.instagramAccountId) {
    return NextResponse.json(
      {
        success: false,
        error: `Social account for "${serviceCode}" has no Instagram account linked`,
      },
      { status: 400 },
    );
  }

  // 5. Decrypt access token
  let accessToken: string;
  try {
    accessToken = decryptToken(account.accessToken);
  } catch {
    return NextResponse.json(
      {
        success: false,
        error:
          "Failed to decrypt social account token. The token may be corrupted.",
      },
      { status: 500 },
    );
  }

  // 6. Process each post
  const results: Array<{
    postId: string;
    platform: string;
    scheduledAt: string;
    status: string;
  }> = [];
  const errors: string[] = [];

  for (const post of posts) {
    // Build full caption with hashtags
    let fullCaption = post.caption;
    if (post.hashtags && post.hashtags.length > 0) {
      fullCaption += "\n\n" + post.hashtags.join(" ");
    }

    const scheduledTime = Math.floor(
      new Date(post.scheduledAt).getTime() / 1000,
    );

    // Validate schedule time (10min – 75 days in future)
    const now = Math.floor(Date.now() / 1000);
    const minTime = now + 10 * 60; // 10 minutes
    const maxTime = now + 75 * 24 * 60 * 60; // 75 days

    if (scheduledTime < minTime || scheduledTime > maxTime) {
      errors.push(
        `Post scheduled at ${post.scheduledAt} must be between 10 minutes and 75 days in the future`,
      );
      continue;
    }

    // Facebook
    if (needsFacebook) {
      try {
        const fbResult = await publishFacebookPost({
          pageId: account.facebookPageId!,
          accessToken,
          message: fullCaption,
          imageUrl: post.imageUrl || undefined,
          scheduledPublishTime: scheduledTime,
        });

        results.push({
          postId: fbResult.id,
          platform: "facebook",
          scheduledAt: post.scheduledAt,
          status: "scheduled",
        });
      } catch (err) {
        errors.push(
          `Facebook post failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    // Instagram
    if (needsInstagram && post.imageUrl) {
      try {
        // Step 1: Create container
        const container = await createInstagramContainer({
          igUserId: account.instagramAccountId!,
          accessToken,
          caption: fullCaption,
          imageUrl: post.imageUrl,
        });

        // Step 2: Publish
        const igResult = await publishInstagramMedia({
          igUserId: account.instagramAccountId!,
          accessToken,
          containerId: container.id,
        });

        results.push({
          postId: igResult.id,
          platform: "instagram",
          scheduledAt: post.scheduledAt,
          status: "scheduled",
        });
      } catch (err) {
        errors.push(
          `Instagram post failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }
  }

  if (results.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "All post scheduling attempts failed",
        details: errors,
      },
      { status: 500 },
    );
  }

  // 7. Create DeliveryLog entries (one per post result)
  for (const result of results) {
    await prisma.deliveryLog.create({
      data: {
        channel: "social",
        serviceCode,
        messageType: `social_${result.platform}`,
        externalId: result.postId,
        recipientCount: 0, // social posts don't have direct recipient count
        status: result.status,
        payload: {
          platform: result.platform,
          scheduledAt: result.scheduledAt,
        },
      },
    });
  }

  // 8. Activity log
  await prisma.activityLog.create({
    data: {
      userId: "cowork",
      action: "api_import",
      entityType: "DeliveryLog",
      entityId: results[0].postId,
      details: {
        channel: "social",
        serviceCode,
        platform,
        postsScheduled: results.length,
        postsFailed: errors.length,
        via: "api_key",
        keyName: "Cowork Automation",
      },
    },
  });

  return NextResponse.json({
    success: true,
    serviceCode,
    posts: results,
    ...(errors.length > 0 ? { warnings: errors } : {}),
  });
});
