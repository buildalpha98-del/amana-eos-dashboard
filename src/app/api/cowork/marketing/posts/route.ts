import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { logCoworkActivity } from "@/app/api/cowork/_lib/cowork-activity-log";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const createPostSchema = z.object({
  title: z.string().min(1, "Title is required"),
  platform: z.enum([
    "facebook", "instagram", "linkedin", "tiktok",
    "email", "newsletter", "website", "flyer",
  ]),
  status: z.enum(["draft", "in_review", "approved", "scheduled", "published"]).default("draft"),
  scheduledDate: z.string().datetime().optional().nullable(),
  content: z.string().optional(),
  notes: z.string().optional(),
  designLink: z.string().optional(),
  canvaDesignId: z.string().optional(),
  canvaDesignUrl: z.string().optional(),
  canvaExportUrl: z.string().optional(),
  pillar: z.string().optional(),
  campaignId: z.string().optional(),
  serviceIds: z.array(z.string()).optional(),
  serviceCodes: z.array(z.string()).optional(),
  recurring: z.enum(["none", "weekly", "fortnightly", "monthly"]).default("none"),
});

const batchSchema = z.object({
  posts: z.array(createPostSchema).min(1).max(50),
});

/**
 * POST /api/cowork/marketing/posts — Create marketing post(s) via API key
 *
 * Accepts a single post or batch of posts.
 * Auth: API key with "marketing:write" scope
 *
 * Body (single): { title, platform, status, ... }
 * Body (batch):  { posts: [{ title, platform, ... }, ...] }
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const isBatch = Array.isArray(body.posts);
    const postsToCreate = isBatch
      ? batchSchema.parse(body).posts
      : [createPostSchema.parse(body)];

    const results: Array<{ id: string; title: string; platform: string; status: string }> = [];
    const errors: Array<{ index: number; error: string }> = [];

    for (let i = 0; i < postsToCreate.length; i++) {
      const p = postsToCreate[i];
      try {
        // Resolve service IDs from codes if provided
        let resolvedServiceIds = p.serviceIds || [];
        if (p.serviceCodes && p.serviceCodes.length > 0) {
          const services = await prisma.service.findMany({
            where: { code: { in: p.serviceCodes }, status: "active" },
            select: { id: true },
          });
          resolvedServiceIds = [...resolvedServiceIds, ...services.map((s) => s.id)];
        }

        const post = await prisma.marketingPost.create({
          data: {
            title: p.title,
            platform: p.platform as any,
            status: p.status as any,
            scheduledDate: p.scheduledDate ? new Date(p.scheduledDate) : null,
            content: p.content || null,
            notes: p.notes || null,
            designLink: p.designLink || null,
            canvaDesignId: p.canvaDesignId || null,
            canvaDesignUrl: p.canvaDesignUrl || null,
            canvaExportUrl: p.canvaExportUrl || null,
            pillar: p.pillar || null,
            campaignId: p.campaignId || null,
            recurring: p.recurring as any,
          },
        });

        // Link services
        if (resolvedServiceIds.length > 0) {
          const uniqueIds = [...new Set(resolvedServiceIds)];
          await prisma.marketingPostService.createMany({
            data: uniqueIds.map((serviceId) => ({
              postId: post.id,
              serviceId,
            })),
            skipDuplicates: true,
          });
        }

        results.push({
          id: post.id,
          title: post.title,
          platform: post.platform,
          status: post.status,
        });
      } catch (err) {
        errors.push({
          index: i,
          error: err instanceof Error ? err.message : "Failed to create post",
        });
      }
    }

    logCoworkActivity({
      action: "api_import",
      entityType: "MarketingPost",
      entityId: results[0]?.id || "batch",
      details: { postsCreated: results.length, postsFailed: errors.length, via: "cowork_api", keyName: "Cowork Automation" },
    });

    return NextResponse.json({
      success: true,
      created: results.length,
      failed: errors.length,
      posts: results,
      ...(errors.length > 0 ? { errors } : {}),
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Cowork Marketing Posts", { err });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

/**
 * GET /api/cowork/marketing/posts — List posts via API key
 * Auth: API key with "marketing:read" scope
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const platform = searchParams.get("platform");
  const serviceCode = searchParams.get("serviceCode");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50"), 100);

  let serviceId: string | undefined;
  if (serviceCode) {
    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true },
    });
    serviceId = service?.id;
  }

  const posts = await prisma.marketingPost.findMany({
    where: {
      deleted: false,
      ...(status ? { status: status as any } : {}),
      ...(platform ? { platform: platform as any } : {}),
      ...(serviceId ? { services: { some: { serviceId } } } : {}),
    },
    include: {
      campaign: { select: { id: true, name: true } },
      services: { select: { service: { select: { id: true, name: true, code: true } } } },
    },
    orderBy: { scheduledDate: { sort: "asc", nulls: "first" } },
    take: limit,
  });

  return NextResponse.json({ posts, count: posts.length });
});
