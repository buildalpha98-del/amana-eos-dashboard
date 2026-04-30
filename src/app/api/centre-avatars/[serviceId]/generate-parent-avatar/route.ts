import { NextResponse } from "next/server";
import crypto from "crypto";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api-error";
import { logger, generateRequestId } from "@/lib/logger";
import { parentAvatarSchema } from "@/lib/centre-avatar/sections";
import { generateStructured } from "@/lib/ai-provider";

type RouteCtx = { params: Promise<{ serviceId: string }> };

const KIND = "centre_avatar.parent_avatar";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24h
const RATE_LIMIT_PER_DAY = 5;

const SYSTEM_PROMPT = `You are a senior marketing strategist for Amana OSHC, an Australian out-of-school-hours-care provider.
Your job is to draft a parent-avatar profile for a specific centre based on the centre snapshot provided.

The avatar is the working model marketing uses to write campaigns, design open-day flyers, and choose messaging
angles. It must be specific to this centre's community and useful as a reference, not generic ad copy. It is
internal — write directly, no marketing fluff.

Cover demographics, psychographics, decision-making, communication preferences, cultural sensitivities,
competition, and community dynamics. If the snapshot doesn't give you enough to fill a field with confidence,
omit that field entirely. Better to leave gaps than to invent.

Your output MUST be valid JSON matching this shape (all top-level keys optional, all subfields optional):

{
  "demographics": {
    "ageRange": "string",
    "familyStructure": "string",
    "income": "string",
    "education": "string",
    "occupations": "string",
    "languages": "string"
  },
  "psychographics": {
    "primaryConcern": "string (2-4 sentences)",
    "primaryWant": "string (2-4 sentences)",
    "topObjections": "string",
    "enrolTrigger": "string",
    "dealBreaker": "string"
  },
  "decisionMaking": {
    "whoDecides": "string",
    "influencers": "string",
    "timeline": "string"
  },
  "commPreferences": {
    "channel": "string",
    "frequency": "string",
    "tone": "string",
    "language": "string"
  },
  "culturalSensitivities": "string (multi-paragraph allowed)",
  "competition": "string",
  "communityDynamics": "string"
}`;

/**
 * POST /api/centre-avatars/[serviceId]/generate-parent-avatar
 *
 * Generates a draft `parentAvatar` JSON from the centre's existing `snapshot`
 * using the hybrid AI provider (Anthropic Claude Sonnet 4.5 by default).
 *
 * Caches by hash of the snapshot input for 24h. Rate limited to 5/user/day.
 * Returns the proposed avatar but does NOT save — the user reviews and clicks
 * Apply in the UI to commit via the existing PATCH /[serviceId] route.
 */
export const POST = withApiAuth(
  async (_req, session, context) => {
    const reqId = generateRequestId();
    const log = logger.withRequestId(reqId);
    const { serviceId } = await (context as unknown as RouteCtx).params;

    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      select: { id: true, snapshot: true },
    });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    const snapshot = (avatar.snapshot ?? {}) as Record<string, unknown>;
    if (!snapshot || Object.keys(snapshot).length === 0) {
      throw ApiError.badRequest(
        "Add some snapshot content first — the AI needs at least centre details and parent drivers to draft a useful avatar.",
      );
    }

    // Hash the snapshot for cache + de-dup. Canonicalise via sorted-key JSON.
    const inputHash = sha256(canonicalise(snapshot));

    // ── Cache lookup ────────────────────────────────────────────────
    const cached = await prisma.aiGenerationCache.findUnique({
      where: { kind_inputHash: { kind: KIND, inputHash } },
    });
    if (cached && cached.expiresAt > new Date()) {
      log.info("AI generate-parent-avatar: cache hit", {
        serviceId,
        kind: KIND,
        cachedAt: cached.createdAt.toISOString(),
      });
      return NextResponse.json({
        avatar: cached.output,
        cached: true,
        provider: cached.provider,
        modelId: cached.modelId,
        costUsd: 0,
      });
    }

    // ── Rate limit (5/user/day, only counts misses) ─────────────────
    const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentMisses = await prisma.aiGenerationCache.count({
      where: {
        kind: KIND,
        generatedById: session.user.id,
        createdAt: { gte: dayAgo },
      },
    });
    if (recentMisses >= RATE_LIMIT_PER_DAY) {
      throw new ApiError(
        429,
        `You've hit the AI generation limit (${RATE_LIMIT_PER_DAY}/day). Try again in a few hours.`,
      );
    }

    // ── Live generation ─────────────────────────────────────────────
    const userPrompt = buildUserPrompt(snapshot);
    let result;
    try {
      result = await generateStructured({
        system: SYSTEM_PROMPT,
        prompt: userPrompt,
        schema: parentAvatarSchema,
        // Default = anthropic + claude-sonnet-4-5 (showcase tier)
      });
    } catch (err) {
      log.error("AI generate-parent-avatar failed", {
        serviceId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new ApiError(
        502,
        err instanceof Error
          ? err.message
          : "AI generation failed",
      );
    }

    // ── Persist to cache + AiUsage telemetry (in parallel) ──────────
    const expiresAt = new Date(Date.now() + CACHE_TTL_MS);
    const startedAt = Date.now();
    await Promise.all([
      prisma.aiGenerationCache.upsert({
        where: { kind_inputHash: { kind: KIND, inputHash } },
        create: {
          kind: KIND,
          inputHash,
          output: result.data as never,
          provider: result.provider,
          modelId: result.modelId,
          costUsd: result.costUsd,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          generatedById: session.user.id,
          expiresAt,
        },
        update: {
          output: result.data as never,
          provider: result.provider,
          modelId: result.modelId,
          costUsd: result.costUsd,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          generatedById: session.user.id,
          expiresAt,
        },
      }),
      prisma.aiUsage.create({
        data: {
          userId: session.user.id,
          templateSlug: KIND,
          model: result.modelId,
          inputTokens: result.inputTokens,
          outputTokens: result.outputTokens,
          durationMs: Date.now() - startedAt,
          section: "centre-avatars",
          metadata: { serviceId, provider: result.provider },
        },
      }),
    ]);

    return NextResponse.json({
      avatar: result.data,
      cached: false,
      provider: result.provider,
      modelId: result.modelId,
      costUsd: result.costUsd,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });
  },
  {
    roles: ["marketing", "owner"],
    rateLimit: { max: 10, windowMs: 60_000 }, // additional per-minute throttle
  },
);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function canonicalise(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalise).join(",")}]`;
  }
  const entries = Object.entries(obj as Record<string, unknown>).sort(([a], [b]) =>
    a.localeCompare(b),
  );
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalise(v)}`).join(",")}}`;
}

function sha256(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function buildUserPrompt(snapshot: Record<string, unknown>): string {
  return `Centre snapshot:\n\n${JSON.stringify(snapshot, null, 2)}\n\nDraft the parent avatar JSON now.`;
}
