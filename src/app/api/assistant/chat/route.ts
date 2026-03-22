import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { getAI } from "@/lib/ai";
import { buildDashboardContext } from "@/lib/ai-context";
import { ASSISTANT_TOOLS, executeToolCall } from "@/lib/ai-tools";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { ApiError } from "@/lib/api-error";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

const bodySchema = z.object({
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().min(1),
  })).min(1, "messages array is required"),
  currentPage: z.string().optional(),
});

const MAX_TOOL_ROUNDS = 5;

/**
 * POST /api/assistant/chat — Streaming AI chat assistant with tool use
 *
 * Body: { messages: { role: "user" | "assistant"; content: string }[] }
 *
 * Returns a Server-Sent Events stream of text deltas.
 * Supports tool calling: the assistant can look up live data during the conversation.
 */
export const POST = withApiAuth(async (req) => {
  const ai = getAI();
  if (!ai) {
    throw new ApiError(503, "AI is not configured. Set ANTHROPIC_API_KEY environment variable.");
  }

  const raw = await req.json();
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed: " + JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  const userMessages = parsed.data.messages;
  const currentPage = parsed.data.currentPage;

  // Build system prompt with live dashboard context
  const dashboardContext = await buildDashboardContext();
  const pageContext = currentPage ? getPageContext(currentPage) : "";
  const systemPrompt = [
    AMANA_SYSTEM_PROMPT,
    "",
    "You also have access to tools that can look up specific live data from the dashboard.",
    "Use these tools when the user asks about specific centres, staff, compliance, finances, or todos.",
    "The dashboard context below provides a high-level overview — use tools for detailed queries.",
    "",
    "Current dashboard overview:",
    dashboardContext,
    ...(pageContext ? [
      "",
      "The user is currently viewing this page:",
      pageContext,
      "Tailor your responses to be relevant to what they're looking at. Proactively offer helpful insights about the current page when appropriate.",
    ] : []),
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
}, { roles: ["owner", "head_office", "admin"] });

// Page-specific context mapping
const PAGE_CONTEXTS: Record<string, string> = {
  "/": "Dashboard home — shows key metrics, recent activity, and alerts across all centres.",
  "/performance": "Centre Performance — health scores, rankings, KPIs, and operational health for all centres. Can help with: analysing score trends, comparing centres, identifying underperforming areas.",
  "/financials": "Financial Overview — revenue, costs, margins, and P&L across services. Can help with: identifying revenue trends, cost anomalies, margin analysis, budget comparisons.",
  "/services": "Services list — all active centres with their status, capacity, and quick stats. Can help with: service comparisons, capacity planning, operational recommendations.",
  "/recruitment": "Recruitment Pipeline — vacancies, candidates, and hiring progress. Can help with: candidate screening insights, pipeline analysis, time-to-fill metrics.",
  "/leave": "Leave Management — team leave requests, balances, and approvals. Can help with: coverage impact analysis, leave pattern insights, staffing gap identification.",
  "/enquiries": "Enquiry Pipeline — leads, enquiries, tours, and enrolments. Can help with: conversion analysis, follow-up priorities, sentiment trends.",
  "/marketing": "Marketing Dashboard — campaigns, social media, and engagement metrics. Can help with: campaign performance, content ideas, audience insights.",
  "/compliance": "Compliance Hub — certificates, audits, QIP, and regulatory tracking. Can help with: expiring certificates, audit preparation, risk assessment.",
  "/queue": "Task Queue — assigned reports and action items from automated analysis. Can help with: prioritising tasks, understanding report findings.",
  "/settings": "Settings — organisation config, user management, integrations. Can help with: system configuration, user role explanations.",
  "/assistant": "AI Assistant — you're talking to me right now! I can help with any dashboard-related queries.",
};

function getPageContext(pathname: string): string {
  // Exact match first
  if (PAGE_CONTEXTS[pathname]) return PAGE_CONTEXTS[pathname];

  // Partial match for nested routes (e.g., /services/abc123)
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length >= 2 && segments[0] === "services") {
    return `Service Detail Page — viewing a specific centre's operations including attendance, menus, scorecards, checklists, and program data. Can help with: centre-specific insights, attendance patterns, operational recommendations.`;
  }

  // Try parent route match
  for (let i = segments.length; i > 0; i--) {
    const partial = "/" + segments.slice(0, i).join("/");
    if (PAGE_CONTEXTS[partial]) return PAGE_CONTEXTS[partial];
  }

  return "";
}
