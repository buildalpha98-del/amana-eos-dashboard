import { z } from "zod";
import { MTOP_OUTCOMES } from "@/lib/schemas/staff-reflection";

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
      field: z.enum([
        "strengths",
        "areasForImprovement",
        "progressNotes",
        "evidenceCollected",
      ]),
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
