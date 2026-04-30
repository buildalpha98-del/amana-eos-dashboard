import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getAI } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

import { parseJsonBody } from "@/lib/api-error";
const bodySchema = z.object({
  templateSlug: z.string().min(1, "templateSlug is required"),
  variables: z.record(z.string(), z.string()).default({}),
  stream: z.boolean().default(false),
  model: z.string().optional(),
  section: z.string().optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

/**
 * POST /api/ai/generate — Unified AI generation endpoint
 *
 * Supports both streaming (SSE) and non-streaming (JSON) responses.
 *
 * Body:
 *   templateSlug: string        — prompt template to use
 *   variables: Record<string, string> — fills {{placeholders}} in template
 *   stream?: boolean            — default false
 *   model?: string              — override template's default model
 *   section?: string            — dashboard section for usage tracking (falls back to slug prefix)
 *   metadata?: object           — extra context logged to AiUsage
 */
export const POST = withApiAuth(async (req, session) => {
const ai = getAI();
  if (!ai) {
    return NextResponse.json(
      { error: "AI is not configured. Set ANTHROPIC_API_KEY environment variable." },
      { status: 503 },
    );
  }

  try {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const {
      templateSlug,
      variables,
      stream,
      model: modelOverride,
      section: sectionOverride,
      metadata,
    } = parsed.data;

    // ── Load template ─────────────────────────────────────────
    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: templateSlug },
    });

    if (!template) {
      return NextResponse.json(
        { error: `Template not found: ${templateSlug}` },
        { status: 404 },
      );
    }

    if (!template.active) {
      return NextResponse.json(
        { error: `Template is disabled: ${templateSlug}` },
        { status: 410 },
      );
    }

    // ── Interpolate variables ────────────────────────────────
    let prompt = template.promptTemplate;
    for (const [key, value] of Object.entries(variables)) {
      prompt = prompt.replaceAll(`{{${key}}}`, value);
    }

    // Warn if unreplaced placeholders remain
    const unreplaced = prompt.match(/\{\{(\w+)\}\}/g);
    if (unreplaced) {
      return NextResponse.json(
        { error: `Missing variables: ${unreplaced.join(", ")}` },
        { status: 400 },
      );
    }

    const selectedModel = modelOverride || template.model;
    const maxTokens = template.maxTokens;
    const section = sectionOverride || templateSlug.split("/")[0];
    const userId = session!.user.id;
    const startTime = Date.now();

    // ── Streaming response ───────────────────────────────────
    if (stream) {
      const aiStream = ai.messages.stream({
        model: selectedModel,
        max_tokens: maxTokens,
        system: AMANA_SYSTEM_PROMPT,
        messages: [{ role: "user", content: prompt }],
      });

      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          let inputTokens = 0;
          let outputTokens = 0;

          try {
            for await (const event of aiStream) {
              if (
                event.type === "content_block_delta" &&
                event.delta.type === "text_delta"
              ) {
                const data = JSON.stringify({ text: event.delta.text });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }

              if (event.type === "message_delta" && event.usage) {
                outputTokens = event.usage.output_tokens;
              }
            }

            // Get final message for input token count
            const finalMessage = await aiStream.finalMessage();
            inputTokens = finalMessage.usage.input_tokens;
            outputTokens = finalMessage.usage.output_tokens;

            // Send usage info as final event before DONE
            const usageData = JSON.stringify({ inputTokens, outputTokens });
            controller.enqueue(encoder.encode(`data: ${usageData}\n\n`));
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();

            // Log usage asynchronously
            prisma.aiUsage.create({
              data: {
                userId,
                templateSlug,
                model: selectedModel,
                inputTokens,
                outputTokens,
                durationMs: Date.now() - startTime,
                section,
                metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
              },
            }).catch((err) => logger.error("Failed to log AI usage", { err }));
          } catch (err) {
            const errMsg = err instanceof Error ? err.message : "Stream error";
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`),
            );
            controller.close();
          }
        },
      });

      return new NextResponse(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    }

    // ── Non-streaming response ───────────────────────────────
    const response = await ai.messages.create({
      model: selectedModel,
      max_tokens: maxTokens,
      system: AMANA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: prompt }],
    });

    const block = response.content[0];
    if (block.type !== "text") {
      return NextResponse.json(
        { error: "Unexpected AI response format" },
        { status: 500 },
      );
    }

    const durationMs = Date.now() - startTime;
    const { input_tokens, output_tokens } = response.usage;

    // Log usage
    await prisma.aiUsage.create({
      data: {
        userId,
        templateSlug,
        model: selectedModel,
        inputTokens: input_tokens,
        outputTokens: output_tokens,
        durationMs,
        section,
        metadata: (metadata as Prisma.InputJsonValue) ?? undefined,
      },
    });

    return NextResponse.json({
      text: block.text,
      usage: {
        inputTokens: input_tokens,
        outputTokens: output_tokens,
        durationMs,
        model: selectedModel,
      },
    });
  } catch (err) {
    logger.error("AI generate failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Generation failed" },
      { status: 500 },
    );
  }
});
