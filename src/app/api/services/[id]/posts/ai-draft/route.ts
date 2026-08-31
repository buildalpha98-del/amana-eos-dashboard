/**
 * Amana AI — turn "what we actually did today" into a post families
 * want to read, tagged against the right MTOP outcomes and NQS areas.
 *
 * Why a dedicated route rather than the generic /api/ai/generate: this
 * needs STRUCTURED output (title, content, outcomes, areas) and, more
 * importantly, the outcomes and areas have to be validated against the
 * real frameworks server-side. A model asked for "the relevant MTOP
 * outcome" will cheerfully invent "Outcome 6: Creativity", and a
 * curriculum tag that isn't in the framework is worse than no tag —
 * it's the tag an assessor picks up on.
 *
 * The educator always sees the draft before it goes anywhere. Nothing
 * here publishes.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { getAI } from "@/lib/ai";
import { AMANA_SYSTEM_PROMPT } from "@/lib/ai-system-prompt";
import { logger } from "@/lib/logger";
import { MTOP_OUTCOMES, NQS_AREAS } from "@/lib/curriculum";

const bodySchema = z.object({
  /** What the educator actually typed — rough notes are the point. */
  notes: z.string().trim().min(3).max(4000),
  /** Optional context that makes the writing specific rather than generic. */
  programme: z.string().trim().max(80).optional(),
  childCount: z.number().int().min(0).max(500).optional(),
});

interface Draft {
  title: string;
  content: string;
  mtop: string[];
  nqs: string[];
}

const VALID_MTOP = new Set<string>(MTOP_OUTCOMES.map((o) => o.label));
const VALID_NQS = new Set<string>(NQS_AREAS.map((a) => a.code));

function buildPrompt(d: z.infer<typeof bodySchema>): string {
  const outcomes = MTOP_OUTCOMES.map(
    (o) => `- "${o.label}" — ${o.description}`,
  ).join("\n");
  const areas = NQS_AREAS.map((a) => `- "${a.code}" — ${a.label}`).join("\n");

  return `An educator at an Amana OSHC service has written rough notes about what the children did today. Turn them into a short post for families, and tag it against the curriculum.

THEIR NOTES:
${d.notes}
${d.programme ? `\nPROGRAMME: ${d.programme}` : ""}${
    d.childCount ? `\nCHILDREN PRESENT: ${d.childCount}` : ""
  }

Write for parents reading on their phone at the end of a workday. Warm, specific, and about what the children did and got out of it — not a report. Two or three short paragraphs at most. Australian English.

Never invent detail that isn't in the notes: no names, no quotes, no activities that weren't mentioned. If the notes are thin, write something short rather than padding it.

Never name individual children — the post may be seen by other families.

Then choose the MTOP outcomes this genuinely evidences. Choose only what the notes actually support; one is a perfectly good answer, and choosing all five means nothing.

MTOP OUTCOMES (use the exact label):
${outcomes}

Then choose the NQS quality areas it evidences, same rule — usually one or two.

NQS AREAS (use the exact code):
${areas}

Reply with ONLY a JSON object, no markdown fence, in this exact shape:
{"title": "...", "content": "...", "mtop": ["Wellbeing"], "nqs": ["QA1"]}`;
}

/** Pull the JSON object out of a reply that may be fenced or chatty. */
function parseDraft(text: string): Draft | null {
  const cleaned = text.replace(/```json\s*|```/g, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    const raw = JSON.parse(cleaned.slice(start, end + 1)) as Partial<Draft>;
    if (typeof raw.title !== "string" || typeof raw.content !== "string") {
      return null;
    }
    return {
      title: raw.title.trim().slice(0, 200),
      content: raw.content.trim().slice(0, 5000),
      // Anything the model invented is dropped rather than passed
      // through — a tag outside the framework is worse than no tag.
      mtop: (Array.isArray(raw.mtop) ? raw.mtop : []).filter(
        (v): v is string => typeof v === "string" && VALID_MTOP.has(v),
      ),
      nqs: (Array.isArray(raw.nqs) ? raw.nqs : []).filter(
        (v): v is string => typeof v === "string" && VALID_NQS.has(v),
      ),
    };
  } catch {
    return null;
  }
}

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session as never, id);

    const ai = getAI();
    if (!ai) {
      throw ApiError.badRequest(
        "Amana AI isn't configured on this environment yet.",
      );
    }

    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(
        parsed.error.issues[0].message ??
          "Tell me what the children did and I'll draft it.",
      );
    }

    const started = Date.now();
    const response = await ai.messages.create({
      model: "claude-sonnet-5",
      max_tokens: 1200,
      system: AMANA_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildPrompt(parsed.data) }],
    });

    const text = response.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("");

    const draft = parseDraft(text);
    if (!draft) {
      logger.warn("AI post draft could not be parsed", { serviceId: id });
      throw ApiError.badRequest(
        "Couldn't draft that one — try again, or write it yourself.",
      );
    }

    // Usage logging mirrors /api/ai/generate so AI spend stays visible
    // in one place. Never let logging failure lose the draft.
    try {
      await prisma.aiUsage.create({
        data: {
          userId: session!.user.id,
          section: "posts",
          templateSlug: "posts/write-up",
          model: "claude-sonnet-5",
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          durationMs: Date.now() - started,
          metadata: { serviceId: id },
        },
      });
    } catch (err) {
      logger.error("AI usage log failed", { err });
    }

    return NextResponse.json(draft);
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
