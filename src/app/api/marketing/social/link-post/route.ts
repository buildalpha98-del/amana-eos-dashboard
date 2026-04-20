import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken, fetchPostMetrics } from "@/lib/meta";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const postSchema = z.object({
  postId: z.string().min(1),
  externalPostId: z.string().min(1),
  externalUrl: z.string().optional(),
});

export const POST = withApiAuth(async (req, session) => {
try {
    const body = await parseJsonBody(req);
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { postId, externalPostId, externalUrl } = parsed.data;

    // Get the post to determine platform
    const post = await prisma.marketingPost.findUnique({
      where: { id: postId },
      select: { id: true, platform: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Update with external link
    await prisma.marketingPost.update({
      where: { id: postId },
      data: {
        externalPostId,
        externalUrl: externalUrl || null,
      },
    });

    // Try to fetch live metrics if platform is facebook or instagram
    if (post.platform === "facebook" || post.platform === "instagram") {
      const connection = await prisma.socialConnection.findFirst({
        where: {
          platform: post.platform,
          status: "connected",
        },
      });

      if (connection?.pageAccessToken) {
        try {
          const token = decryptToken(connection.pageAccessToken);
          const metrics = await fetchPostMetrics(
            token,
            externalPostId,
            post.platform as "facebook" | "instagram"
          );

          if (metrics) {
            await prisma.marketingPost.update({
              where: { id: postId },
              data: {
                likes: metrics.likes,
                comments: metrics.comments,
                shares: metrics.shares,
                reach: metrics.reach,
                engagementSyncedAt: new Date(),
              },
            });
          }
        } catch (syncErr) {
          logger.error("Failed to sync metrics on link", { err: syncErr });
          // Non-fatal: the link was saved even if metrics fetch failed
        }
      }
    }

    const updatedPost = await prisma.marketingPost.findUnique({
      where: { id: postId },
    });

    return NextResponse.json(updatedPost);
  } catch (err) {
    logger.error("Link social post error", { err });
    return NextResponse.json(
      { error: "Failed to link social post" },
      { status: 500 }
    );
  }
}, { roles: ["owner", "head_office", "admin", "marketing"] });
