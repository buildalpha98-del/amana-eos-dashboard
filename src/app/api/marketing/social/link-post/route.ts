import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { decryptToken, fetchPostMetrics } from "@/lib/meta";

export async function POST(req: Request) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  try {
    const body = await req.json();
    const { postId, externalPostId, externalUrl } = body as {
      postId?: string;
      externalPostId?: string;
      externalUrl?: string;
    };

    if (!postId || !externalPostId) {
      return NextResponse.json(
        { error: "postId and externalPostId are required" },
        { status: 400 }
      );
    }

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
          console.error("Failed to sync metrics on link:", syncErr);
          // Non-fatal: the link was saved even if metrics fetch failed
        }
      }
    }

    const updatedPost = await prisma.marketingPost.findUnique({
      where: { id: postId },
    });

    return NextResponse.json(updatedPost);
  } catch (err) {
    console.error("Link social post error:", err);
    return NextResponse.json(
      { error: "Failed to link social post" },
      { status: 500 }
    );
  }
}
