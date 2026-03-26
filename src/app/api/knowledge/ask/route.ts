import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { getAI } from "@/lib/ai";
import { searchChunks, formatChunksForPrompt } from "@/lib/document-indexer";
import { logger } from "@/lib/logger";
import { z } from "zod";

const bodySchema = z.object({
  question: z.string().min(3, "Question must be at least 3 characters").max(500),
});

/**
 * POST /api/knowledge/ask — Ask a question against the knowledge base
 *
 * Body: { question: string (3-500 chars) }
 * Auth: all roles, rate limited to 30 req/min
 *
 * Searches indexed document chunks, loads the knowledge/answer prompt template,
 * calls Claude, and streams the response via SSE. Final event includes sources.
 */
export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest(
        "Validation failed",
        parsed.error.flatten().fieldErrors,
      );
    }

    const { question } = parsed.data;

    // Search for relevant chunks
    const searchResults = await searchChunks(question);
    const context = formatChunksForPrompt(searchResults);

    // Get AI client
    const ai = getAI();
    if (!ai) {
      throw new ApiError(503, "AI is not configured. Set ANTHROPIC_API_KEY environment variable.");
    }

    // Load the knowledge/answer template
    const template = await prisma.aiPromptTemplate.findUnique({
      where: { slug: "knowledge/answer" },
    });

    const model = template?.model ?? "claude-sonnet-4-5-20250514";
    const maxTokens = template?.maxTokens ?? 1024;

    // Build the prompt
    let prompt: string;
    if (template?.promptTemplate) {
      prompt = template.promptTemplate
        .replaceAll("{{context}}", context || "No relevant documents found.")
        .replaceAll("{{question}}", question);
    } else {
      prompt = [
        "Answer the following question using only the context provided below.",
        "If the context does not contain enough information, say so.",
        "",
        "Context:",
        context || "No relevant documents found.",
        "",
        `Question: ${question}`,
      ].join("\n");
    }

    const userId = session.user.id;
    const startTime = Date.now();

    // Build sources metadata from search results
    const sources = searchResults.map((r) => ({
      documentId: r.documentId,
      documentTitle: r.documentTitle,
      documentCategory: r.documentCategory,
      fileName: r.fileName,
    }));

    // Stream via SSE
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          const response = await ai.messages.create({
            model,
            max_tokens: maxTokens,
            messages: [{ role: "user", content: prompt }],
          });

          const textBlock = response.content.find(
            (b: { type: string }) => b.type === "text",
          ) as { type: "text"; text: string } | undefined;

          if (textBlock?.text) {
            const data = JSON.stringify({ text: textBlock.text });
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          }

          // Send sources as final data event
          const sourcesData = JSON.stringify({ sources });
          controller.enqueue(encoder.encode(`data: ${sourcesData}\n\n`));

          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();

          // Log usage asynchronously
          const { input_tokens, output_tokens } = response.usage;
          prisma.aiUsage
            .create({
              data: {
                userId,
                templateSlug: "knowledge/answer",
                model,
                inputTokens: input_tokens,
                outputTokens: output_tokens,
                durationMs: Date.now() - startTime,
                section: "knowledge",
              },
            })
            .catch((err: unknown) =>
              logger.error("Failed to log knowledge AI usage", { err }),
            );
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
  },
  { rateLimit: { max: 30, windowMs: 60_000 } },
);
