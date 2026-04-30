import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireCronLock, verifyCronSecret } from "@/lib/cron-guard";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 32) || "centre";
}

function buildRecapDraft(opts: {
  campaignName: string;
  campaignType: string;
  centreName: string;
  centreCode: string;
  state: string | null;
}): { title: string; content: string } {
  const stateHashtag = opts.state ? `#${opts.state}` : "#AmanaOSHC";
  const centreHashtag = `#${slugify(opts.centreCode || opts.centreName)}`;
  const typeHashtag = `#${slugify(opts.campaignType)}`;

  const content = `✨ Recap: ${opts.campaignName} at ${opts.centreName}

[2-3 line draft based on activation type and notes — fill in the real story, photos, attendance numbers]

[Insert photo/video here]

#AmanaOSHC ${stateHashtag} ${centreHashtag} ${typeHashtag}`;

  return {
    title: `Recap draft: ${opts.campaignName} (${opts.centreName})`,
    content,
  };
}

export const GET = withApiHandler(async (req) => {
  const auth = verifyCronSecret(req);
  if (auth) return auth.error;

  const guard = await acquireCronLock("draft-activation-recap", "daily");
  if (!guard.acquired) {
    return NextResponse.json({ message: guard.reason, skipped: true });
  }

  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS);

    const candidates = await prisma.campaignActivationAssignment.findMany({
      where: {
        activationDeliveredAt: { not: null, lte: cutoff },
      },
      include: {
        campaign: { select: { id: true, name: true, type: true } },
        service: { select: { id: true, name: true, code: true, state: true } },
        recapPosts: { select: { id: true } },
      },
    });

    const akram = await prisma.user.findFirst({
      where: { role: "marketing", active: true },
      select: { id: true },
    });

    const created: Array<{ activationId: string; postId: string; draftId: string }> = [];
    const skipped: Array<{ activationId: string; reason: string }> = [];

    for (const c of candidates) {
      if (c.recapPosts.length > 0) {
        skipped.push({ activationId: c.id, reason: "recap_post_exists" });
        continue;
      }
      const draftAlready = await prisma.aiTaskDraft.findFirst({
        where: {
          source: "activation-recap",
          targetId: c.id,
        },
        select: { id: true },
      });
      if (draftAlready) {
        skipped.push({ activationId: c.id, reason: "draft_exists_or_dismissed" });
        continue;
      }

      const draftBody = buildRecapDraft({
        campaignName: c.campaign.name,
        campaignType: c.campaign.type,
        centreName: c.service.name,
        centreCode: c.service.code,
        state: c.service.state,
      });

      const post = await prisma.marketingPost.create({
        data: {
          title: draftBody.title,
          platform: "instagram",
          format: "feed",
          status: "draft",
          content: draftBody.content,
          campaignId: c.campaign.id,
          recapForActivationId: c.id,
          assigneeId: akram?.id,
          pillar: "recap",
        },
        select: { id: true },
      });

      const draft = await prisma.aiTaskDraft.create({
        data: {
          source: "activation-recap",
          targetId: c.id,
          taskType: "communication",
          title: `Recap draft ready: ${c.campaign.name} at ${c.service.name}`,
          content: `Activation delivered ${c.activationDeliveredAt?.toISOString().slice(0, 10)}. A draft Instagram post has been created in MarketingPost (${post.id}) — review, add photos, then schedule.\n\n---\n\n${draftBody.content}`,
          metadata: {
            kind: "activation_recap",
            postId: post.id,
            activationId: c.id,
            serviceId: c.service.id,
            campaignName: c.campaign.name,
          },
          status: "ready",
          model: "system",
        },
        select: { id: true },
      });

      created.push({ activationId: c.id, postId: post.id, draftId: draft.id });
    }

    await guard.complete({ created: created.length, skipped: skipped.length });
    return NextResponse.json({
      message: "Activation recap cron complete",
      created,
      skipped,
    });
  } catch (err) {
    logger.error("draft-activation-recap failed", { err });
    await guard.fail(err);
    throw err;
  }
});
