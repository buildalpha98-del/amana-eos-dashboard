import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { getAI } from "@/lib/ai";
import { buildDashboardContext } from "@/lib/ai-context";

/**
 * POST /api/assistant/chat — Streaming AI chat assistant
 *
 * Body: { messages: { role: "user" | "assistant"; content: string }[] }
 *
 * Returns a Server-Sent Events stream of text deltas.
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const ai = getAI();
  if (!ai) {
    return NextResponse.json(
      { error: "AI is not configured. Set ANTHROPIC_API_KEY environment variable." },
      { status: 503 },
    );
  }

  try {
    const body = await req.json();
    const messages = body.messages as { role: "user" | "assistant"; content: string }[];

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 },
      );
    }

    // Build system prompt with live dashboard context
    const dashboardContext = await buildDashboardContext();
    const systemPrompt = [
      "You are Amana AI, an intelligent assistant for Amana OSHC (Outside School Hours Care).",
      "You help owners and administrators understand their dashboard data, answer questions about financial performance, operations, compliance, staffing, and strategic priorities.",
      "Use Australian English. Be concise, data-driven, and professional.",
      "When referencing specific numbers, cite the data source (e.g. 'based on current month financials').",
      "If you don't have enough data to answer a question, say so clearly.",
      "",
      "Here is the current dashboard data:",
      "",
      dashboardContext,
    ].join("\n");

    // Stream the response
    const stream = ai.messages.stream({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: 1024,
      system: systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    });

    // Convert to SSE ReadableStream
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const event of stream) {
            if (
              event.type === "content_block_delta" &&
              event.delta.type === "text_delta"
            ) {
              const data = JSON.stringify({ text: event.delta.text });
              controller.enqueue(encoder.encode(`data: ${data}\n\n`));
            }
          }
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
          controller.close();
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
  } catch (err) {
    console.error("Assistant chat failed:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Chat failed" },
      { status: 500 },
    );
  }
}
