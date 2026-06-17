import { NextRequest, NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { getAI } from "@/lib/ai";
import { buildDashboardContext } from "@/lib/ai-context";
import { ASSISTANT_TOOLS, executeToolCall } from "@/lib/ai-tools";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { ApiError, parseJsonBody } from "@/lib/api-error";
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
export const POST = withApiAuth(async (req, session) => {
  const ai = getAI();
  if (!ai) {
    throw new ApiError(503, "AI is not configured. Set ANTHROPIC_API_KEY environment variable.");
  }

  const raw = await parseJsonBody(req);
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed: " + JSON.stringify(parsed.error.flatten().fieldErrors));
  }
  const userMessages = parsed.data.messages;
  const currentPage = parsed.data.currentPage;

  // 2026-06-02: tool gate. Non-admin staff get the knowledge-base
  // search only — the dashboard-lookup tools surface data (financials,
  // staff lists, expiring certs, enquiry pipeline) that should stay
  // admin-only even when accessed through the bot. Admins keep the
  // full set.
  const role = session!.user.role;
  const isAdmin = role === "owner" || role === "admin" || role === "head_office";
  const allowedTools = isAdmin
    ? ASSISTANT_TOOLS
    : ASSISTANT_TOOLS.filter((t) => t.name === "search_knowledge_base");

  // Build system prompt with live dashboard context.
  //
  // 2026-06-02 retrieval-quality rewrite:
  //   - Knowledge-base search is the FIRST tool the bot tries, not a
  //     fallback after the model "doesn't know".
  //   - The bot retries with synonyms / OSHC terminology before
  //     concluding the content isn't there.
  //   - Sources are cited so staff can verify ("From the Amana Way →
  //     Family Communication: …").
  //   - When the knowledge base genuinely doesn't have the answer the
  //     bot says so plainly — no "ask your state manager / check
  //     training materials" boilerplate that masks a stale base.
  const dashboardContext = await buildDashboardContext();
  const pageContext = currentPage ? getPageContext(currentPage) : "";
  const systemPrompt = [
    AMANA_SYSTEM_PROMPT,
    "",
    "## How you answer questions",
    "",
    "You are the staff-facing knowledge hub for Amana OSHC. Your job is",
    "to answer questions accurately and quickly from the org's own",
    "documented content — the Amana Way, Employee Handbook, Proven Process,",
    "operational SOPs, OWNA procedures, communication & incident",
    "guidelines, and any other knowledge the admin has loaded.",
    "",
    "### Knowledge-base search — the rule",
    "",
    "BEFORE you say you don't know, you MUST search the knowledge base.",
    "If the first search returns nothing or looks irrelevant, run AT",
    "LEAST one more search with different keywords. Try:",
    "  - The user's wording (verbatim)",
    "  - Common synonyms and OSHC industry terminology",
    "  - Related concepts (e.g. 'posting to families' → also try",
    "    'parent communication', 'family updates', 'OWNA Family App',",
    "    'daily report', 'announcements')",
    "",
    "Only after 2+ searches return nothing relevant should you tell",
    "the user the information isn't in the knowledge base.",
    "",
    "### When you find an answer",
    "",
    "Cite the source like: *From the Amana Way → [section heading]:*",
    "Then give a concise, actionable answer. Quote key procedural lines",
    "verbatim where precision matters (deadlines, escalation paths,",
    "policy wording).",
    "",
    "### When you genuinely don't find an answer",
    "",
    "Say plainly: 'I couldn't find this in the knowledge base.' Then",
    "suggest they ask their manager OR flag it as a knowledge-base gap.",
    "DO NOT pad with vague filler like 'check recent training materials'",
    "or 'this should be documented somewhere'. Be direct.",
    "",
    "NEVER invent procedures or quote text you didn't retrieve.",
    ...(pageContext
      ? [
          "",
          "## Current page context",
          pageContext,
          "Tailor your responses to be relevant to what they're looking at.",
        ]
      : []),
    "",
    "## Dashboard overview (high-level — use tools for specifics)",
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
            // 2026-06-17: claude-sonnet-4-20250514 has been deprecated
            // upstream; the Anthropic API returns 404 "model not found"
            // for that id. Bumped to claude-sonnet-4-5 (the current
            // Sonnet 4.5 generation, matches the cost table in
            // ai-provider/types.ts).
            model: "claude-sonnet-4-5-20250514",
            max_tokens: 1024,
            system: systemPrompt,
            messages: apiMessages,
            tools: allowedTools,
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
});
// 2026-06-02: removed `roles:` restriction so the FloatingChatWidget
// works for every authenticated staff member, not just admins. The
// bot's tools are read-only (knowledge-base search + dashboard lookups
// that don't expose data the caller couldn't otherwise see), so
// opening the chat endpoint to all roles is safe.

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
