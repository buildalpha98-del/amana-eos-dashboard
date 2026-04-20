import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// System prompt for the AI agent
// ---------------------------------------------------------------------------
const SYSTEM_PROMPT = `You are an AI assistant for Amana OSHC (Out of School Hours Care), an Australian childcare organisation. You help staff complete their tasks by drafting deliverables.

Brand voice: Professional but warm. Australian English. Supportive of families and children's wellbeing.

When drafting emails:
- Use proper greeting (Dear/Hi [Name])
- Reference the specific Amana OSHC centre by name
- Include relevant details from the task context
- Sign off as the staff member (not as AI)
- Keep tone appropriate for the audience (formal for principals, warm for parents)

When creating documents:
- Use clear headings and structure
- Include relevant compliance references (NQS, ACECQA) where applicable
- Follow Amana OSHC templates and formatting

When doing research:
- Provide concise summaries with key findings
- Include source references where possible
- Highlight actionable recommendations

Always output in markdown format.`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface TaskContext {
  sourceType: "todo" | "marketingTask" | "coworkTodo" | "ticket" | "issue";
  sourceId: string;
  title: string;
  description?: string | null;
  assigneeName?: string | null;
  assigneeRole?: string | null;
  serviceName?: string | null;
  serviceCode?: string | null;
  linkedRock?: string | null;
  linkedIssue?: string | null;
  priority?: string | null;
  dueDate?: Date | null;
}

export type TaskType = "communication" | "research" | "document" | "admin";

// ---------------------------------------------------------------------------
// Classifier — determines what kind of draft to generate
// ---------------------------------------------------------------------------
export function classifyTask(title: string, description?: string | null): TaskType {
  const text = `${title} ${description || ""}`.toLowerCase();

  if (/email|write to|contact|send|draft|letter|notify|inform|message|announce/.test(text)) {
    return "communication";
  }
  if (/research|find|compare|look into|investigate|analyse|review|assess|evaluate/.test(text)) {
    return "research";
  }
  if (/create|prepare|write|document|checklist|plan|report|template|policy|procedure/.test(text)) {
    return "document";
  }
  return "admin";
}

// ---------------------------------------------------------------------------
// Prompt builder — turns task context into an LLM prompt
// ---------------------------------------------------------------------------
export function buildPrompt(ctx: TaskContext, taskType: TaskType): string {
  let prompt = `Task: ${ctx.title}`;
  if (ctx.description) prompt += `\nDetails: ${ctx.description}`;
  if (ctx.serviceName) prompt += `\nCentre: ${ctx.serviceName} (${ctx.serviceCode || "unknown code"})`;
  if (ctx.assigneeName) prompt += `\nAssigned to: ${ctx.assigneeName} (${ctx.assigneeRole || "staff"})`;
  if (ctx.linkedRock) prompt += `\nLinked Rock: ${ctx.linkedRock}`;
  if (ctx.linkedIssue) prompt += `\nLinked Issue: ${ctx.linkedIssue}`;
  if (ctx.dueDate) prompt += `\nDue: ${ctx.dueDate.toLocaleDateString("en-AU")}`;

  switch (taskType) {
    case "communication":
      prompt += "\n\nPlease draft the email or message described above. Include subject line, body, and sign-off.";
      break;
    case "research":
      prompt += "\n\nPlease research this topic and provide a concise summary with key findings and recommendations.";
      break;
    case "document":
      prompt += "\n\nPlease create the document described above with proper structure, headings, and content.";
      break;
    case "admin":
      prompt += "\n\nPlease prepare whatever is needed to complete this administrative task. Provide clear steps or deliverables.";
      break;
  }

  return prompt;
}

// ---------------------------------------------------------------------------
// Draft generator — calls Anthropic API
// ---------------------------------------------------------------------------
export async function generateDraft(
  ctx: TaskContext,
): Promise<{ content: string; tokensUsed: number } | null> {
  const taskType = classifyTask(ctx.title, ctx.description);
  const userPrompt = buildPrompt(ctx, taskType);

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY || "",
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 2000,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      logger.error("AI draft generation failed", {
        status: response.status,
        body: errorBody.slice(0, 500),
        sourceType: ctx.sourceType,
        sourceId: ctx.sourceId,
      });
      return null;
    }

    const data = await response.json();
    const content = data.content?.[0]?.text || "";
    const inputTokens: number = data.usage?.input_tokens || 0;
    const outputTokens: number = data.usage?.output_tokens || 0;

    return { content, tokensUsed: inputTokens + outputTokens };
  } catch (err) {
    logger.error("AI draft generation error", { err, sourceId: ctx.sourceId });
    return null;
  }
}

// ---------------------------------------------------------------------------
// Save draft to database + log usage
// ---------------------------------------------------------------------------
export async function saveDraft(
  ctx: TaskContext,
  content: string,
  tokensUsed: number,
): Promise<string> {
  const taskType = classifyTask(ctx.title, ctx.description);

  // Build the polymorphic FK object
  const fkField: Record<string, string> = {};
  switch (ctx.sourceType) {
    case "todo":
      fkField.todoId = ctx.sourceId;
      break;
    case "marketingTask":
      fkField.marketingTaskId = ctx.sourceId;
      break;
    case "coworkTodo":
      fkField.coworkTodoId = ctx.sourceId;
      break;
    case "ticket":
      fkField.ticketId = ctx.sourceId;
      break;
    case "issue":
      fkField.issueId = ctx.sourceId;
      break;
  }

  const draft = await prisma.aiTaskDraft.create({
    data: {
      ...fkField,
      taskType,
      title: `AI Draft: ${ctx.title}`,
      content,
      tokensUsed,
      model: "claude-haiku-4-5-20251001",
      metadata: {
        sourceType: ctx.sourceType,
        assigneeName: ctx.assigneeName,
        serviceName: ctx.serviceName,
        generatedAt: new Date().toISOString(),
      },
    },
  });

  // Log AI usage (non-critical — don't let failures break the draft)
  await prisma.aiUsage
    .create({
      data: {
        userId: "system",
        templateSlug: `agent/${ctx.sourceType}`,
        inputTokens: Math.round(tokensUsed * 0.7), // approximate split
        outputTokens: Math.round(tokensUsed * 0.3),
        durationMs: 0,
        model: "claude-haiku-4-5-20251001",
        section: "agent",
      },
    })
    .catch((err) => logger.error("Failed to log AI usage for task agent draft", { err, draftId: draft.id, sourceId: ctx.sourceId }));

  return draft.id;
}
