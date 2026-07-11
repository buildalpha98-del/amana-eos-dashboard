import { z } from "zod";
import { MTOP_OUTCOMES } from "@/lib/schemas/staff-reflection";
import { ELEMENT_BY_CODE, EVIDENCE_SLOTS, elementsForQa } from "@/lib/nqs-taxonomy";

/**
 * Pure helpers for the Friday qip-weekly-update cron: evidence-week windowing,
 * prompt block assembly, and strict parsing of the two AI JSON responses.
 * Kept side-effect-free so they unit-test without any cron/AI scaffolding.
 */

const EXCERPT_LEN = 300;

/** UTC instant of Monday 00:00 in Australia/Sydney for the week containing `now`. */
export function mondayOfWeekSydney(now = new Date()): Date {
  const syd = new Date(now.toLocaleString("en-US", { timeZone: "Australia/Sydney" }));
  const offsetMs = syd.getTime() - now.getTime();
  const sydMidnight = new Date(syd);
  sydMidnight.setHours(0, 0, 0, 0);
  // getDay(): Sun=0 … Sat=6 → days since Monday
  const daysSinceMonday = (sydMidnight.getDay() + 6) % 7;
  sydMidnight.setDate(sydMidnight.getDate() - daysSinceMonday);
  return new Date(sydMidnight.getTime() - offsetMs);
}

export interface EvidenceItem {
  kind: "reflection" | "observation";
  id: string;
  date: Date;
  content: string;
  mtopOutcomes?: string[];
  childCount?: number;
}

export function excerptOf(text: string): string {
  return text.length > EXCERPT_LEN ? `${text.slice(0, EXCERPT_LEN - 1)}…` : text;
}

/** Numbered excerpt block for the {{evidence}} / {{items}} template variables. */
export function buildEvidenceExcerpts(items: EvidenceItem[]): string {
  return items
    .map((item, i) => {
      const date = item.date.toLocaleDateString("en-AU", {
        timeZone: "Australia/Sydney",
      });
      const extras: string[] = [];
      if (item.mtopOutcomes?.length) extras.push(`MTOP: ${item.mtopOutcomes.join(", ")}`);
      if (item.childCount) extras.push(`${item.childCount} children`);
      const suffix = extras.length ? ` (${extras.join("; ")})` : "";
      return `${i + 1}. [${item.kind}, ${date}]${suffix} ${excerptOf(item.content)}`;
    })
    .join("\n");
}

/** Strip ```json fences models sometimes add despite instructions. */
function stripFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
}

const tagResponseSchema = z.object({
  items: z.array(
    z.object({
      index: z.number().int().min(1),
      qualityAreas: z.array(z.number().int().min(1).max(7)).max(7),
      mtopOutcomes: z.array(z.enum(MTOP_OUTCOMES)).max(5),
    }),
  ),
});
export type TagResponse = z.infer<typeof tagResponseSchema>;

const changesResponseSchema = z.object({
  changes: z.array(
    z.object({
      elementCode: z
        .string()
        .regex(/^[1-7]\.[1-3]\.[1-3]$/)
        .refine((code) => ELEMENT_BY_CODE.has(code), "unknown NQS element"),
      proposedText: z.string().min(1),
      rationale: z.string().min(1),
    }),
  ),
});
export type ChangesResponse = z.infer<typeof changesResponseSchema>;

function parseJson<T>(schema: z.ZodType<T>, text: string): T | null {
  try {
    const parsed = schema.safeParse(JSON.parse(stripFences(text)));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function parseTagResponse(text: string): TagResponse | null {
  return parseJson(tagResponseSchema, text);
}

export function parseChangesResponse(text: string): ChangesResponse | null {
  return parseJson(changesResponseSchema, text);
}

/**
 * Prompt block describing a quality area's NQS elements with their current
 * evidence state, so the model targets specific elements and never proposes
 * for a full one. `stored` is the service's SatElementAssessment rows.
 */
export function buildElementContext(
  qa: number,
  stored: Array<{ elementCode: string; evidence: string[] }>,
): string {
  const byCode = new Map(stored.map((r) => [r.elementCode, r]));
  return elementsForQa(qa)
    .map((el) => {
      const evidence = (byCode.get(el.code)?.evidence ?? []).filter((e) => e.trim());
      const free = EVIDENCE_SLOTS - evidence.length;
      const current =
        evidence.length > 0
          ? evidence.map((e, i) => `    ${i + 1}) ${excerptOf(e)}`).join("\n")
          : "    (no evidence recorded yet)";
      return `${el.code} [${el.concept}] — ${el.description}\n  Free evidence slots: ${free}\n  Current evidence:\n${current}`;
    })
    .join("\n\n");
}

/** Elements of a QA that still have at least one free evidence slot. */
export function elementCodesWithFreeSlot(
  qa: number,
  stored: Array<{ elementCode: string; evidence: string[] }>,
): Set<string> {
  const byCode = new Map(stored.map((r) => [r.elementCode, r]));
  return new Set(
    elementsForQa(qa)
      .filter((el) => {
        const used = (byCode.get(el.code)?.evidence ?? []).filter((e) => e.trim()).length;
        return used < EVIDENCE_SLOTS;
      })
      .map((el) => el.code),
  );
}
