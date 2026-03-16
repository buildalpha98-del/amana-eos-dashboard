import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { getAI } from "@/lib/ai";
import { buildDashboardContext } from "@/lib/ai-context";
import { ASSISTANT_TOOLS, executeToolCall } from "@/lib/ai-tools";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import type Anthropic from "@anthropic-ai/sdk";

const MAX_TOOL_ROUNDS = 5;

/**
 * POST /api/assistant/chat — Streaming AI chat assistant with tool use
 *
 * Body: { messages: { role: "user" | "assistant"; content: string }[] }
 *
 * Returns a Server-Sent Events stream of text deltas.
 * Supports tool calling: the assistant can look up live data during the conversation.
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
    const userMessages = body.messages as { role: "user" | "assistant"; content: string }[];

    if (!Array.isArray(userMessages) || userMessages.length === 0) {
      return NextResponse.json(
        { error: "messages array is required" },
        { status: 400 },
      );
    }

    // Build system prompt with live dashboard context
    const dashboardContext = await buildDashboardContext();
    const systemPrompt = [
      AMANA_SYSTEM_PROMPT,
      "",
      "You also have access to tools that can look up specific live data from the dashboard.",
      "Use these tools when the user asks about specific centres, staff, compliance, finances, or todos.",
      "The dashboard context below provides a high-level overview — use tools for detailed queries.",
      "",
      "Current dashboard overview:",
      dashboardContext,
    ].join("\n");

    // Build Anthropic message format
    const apiMessages: Anthropic.Messages.MessageParam[] = userMessages.map((m) => ({
      role: m.role,
      content: m.content,
    }));

    // SSE streaming with tool-use loop
    const encoder = new TextEncoder();
    const readable = new ReadableStream({
      async start(controller) {
        try {
          let rounds = 0;

          while (rounds < MAX_TOOL_ROUNDS) {
            rounds++;

            const response = await ai.messages.create({
              model: "claude-sonnet-4-5-20250514",
              max_tokens: 1024,
              system: systemPrompt,
              messages: apiMessages,
              tools: ASSISTANT_TOOLS,
            });

            // Check if we need to handle tool use
            const toolUseBlocks = response.content.filter(
              (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
            );
            const textBlocks = response.content.filter(
              (b): b is Anthropic.Messages.TextBlock => b.type === "text",
            );

            // Stream any text blocks
            for (const block of textBlocks) {
              if (block.text) {
                const data = JSON.stringify({ text: block.text });
                controller.enqueue(encoder.encode(`data: ${data}\n\n`));
              }
            }

            // If no tool use or stop_reason is end_turn, we're done
            if (toolUseBlocks.length === 0 || response.stop_reason === "end_turn") {
              break;
            }

            // Execute tool calls and build tool results
            const toolResults: Anthropic.Messages.ToolResultBlockParam[] = [];
            for (const toolBlock of toolUseBlocks) {
              const result = await executeToolCall(
                toolBlock.name,
                toolBlock.input as Record<string, unknown>,
              );
              toolResults.push({
                type: "tool_result",
                tool_use_id: toolBlock.id,
                content: result,
              });
            }

            // Add assistant response and tool results to conversation
            apiMessages.push({
              role: "assistant",
              content: response.content,
            });
            apiMessages.push({
              role: "user",
              content: toolResults,
            });
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
