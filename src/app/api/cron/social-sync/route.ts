import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decryptToken, fetchPostMetrics } from "@/lib/meta";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("social-sync", "2hourly");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  let synced = 0;
  let errors = 0;

  try {
    // Fetch all connected SocialConnection records
    const connections = await prisma.socialConnection.findMany({
      where: { status: "connected" },
    });

    for (const connection of connections) {
      try {
        // Check if token is expired
        if (
          connection.tokenExpiresAt &&
          connection.tokenExpiresAt < new Date()
        ) {
          await prisma.socialConnection.update({
            where: { id: connection.id },
            data: {
              status: "expired",
              lastSyncAt: new Date(),
              lastSyncStatus: "error",
              lastSyncError: "Token expired",
            },
          });
          errors++;
          continue;
        }

        if (!connection.pageAccessToken) {
          await prisma.socialConnection.update({
            where: { id: connection.id },
            data: {
              lastSyncAt: new Date(),
              lastSyncStatus: "error",
              lastSyncError: "No page access token",
            },
          });
          errors++;
          continue;
        }

        const platform = connection.platform;

        // Only sync facebook and instagram
        if (platform !== "facebook" && platform !== "instagram") {
          continue;
        }

        // Find all MarketingPost records with an externalPostId that match this platform
        const posts = await prisma.marketingPost.findMany({
          where: {
            platform,
            externalPostId: { not: null },
            deleted: false,
          },
          select: {
            id: true,
            externalPostId: true,
          },
        });

        if (posts.length === 0) {
          await prisma.socialConnection.update({
            where: { id: connection.id },
            data: {
              lastSyncAt: new Date(),
              lastSyncStatus: "success",
              lastSyncError: null,
            },
          });
          continue;
        }

        const token = decryptToken(connection.pageAccessToken);
        let connectionSynced = 0;

        for (const post of posts) {
          if (!post.externalPostId) continue;

          try {
            const metrics = await fetchPostMetrics(
              token,
              post.externalPostId,
              platform as "facebook" | "instagram"
            );

            if (metrics) {
              await prisma.marketingPost.update({
                where: { id: post.id },
                data: {
                  likes: metrics.likes,
                  comments: metrics.comments,
                  shares: metrics.shares,
                  reach: metrics.reach,
                  engagementSyncedAt: new Date(),
                },
              });
              connectionSynced++;
            }
          } catch (postErr) {
            logger.error("Failed to sync post", { postId: post.id, externalPostId: post.externalPostId, err: postErr });
            // Continue with other posts
          }
        }

        await prisma.socialConnection.update({
          where: { id: connection.id },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: "success",
            lastSyncError: null,
          },
        });

        synced += connectionSynced;
      } catch (connErr) {
        logger.error("Failed to sync connection", { connectionId: connection.id, err: connErr });
        const errorMessage =
          connErr instanceof Error ? connErr.message : "Unknown error";

        await prisma.socialConnection.update({
          where: { id: connection.id },
          data: {
            lastSyncAt: new Date(),
            lastSyncStatus: "error",
            lastSyncError: errorMessage,
          },
        });

        errors++;
      }
    }

    await guard.complete({ synced, errors });
    return NextResponse.json({ synced, errors });
  } catch (err) {
    await guard.fail(err);
    throw err;
  }
});
