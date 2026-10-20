import { z } from "zod";
import { generateStructured } from "@/lib/ai-provider";
import { SERIOUS_INCIDENT_CATEGORIES } from "@/lib/compliance-clocks";
import { logger } from "@/lib/logger";
import { buildAssessmentPrompt, KNOX_SYSTEM_PROMPT } from "@/lib/knox/prompt";
import type { RulesResult, TriageSubject } from "@/lib/knox/types";

export const MISSING_FIELD_LABELS = [
  "circumstances",
  "actionTaken",
  "firstAidDetails",
  "witnesses",
  "parentNotifiedName",
  "parentNotifiedMethod",
  "becameAwareAt",
  "seriousIncidentCategory",
  "location",
  "timeOfDay",
] as const;

const SERIOUS_INCIDENT_CATEGORY_VALUES = SERIOUS_INCIDENT_CATEGORIES.map((c) => c.value) as [
  string,
  ...string[],
];

export const assessmentSchema = z.object({
  severityOpinion: z.enum(["agrees", "understated", "unsure"]),
  rationale: z.string().min(1).max(600),
  missingFields: z.array(z.enum(MISSING_FIELD_LABELS)).max(10),
  suggestedSeverity: z.enum(["moderate", "serious", "reportable"]).optional(),
  suggestedCategory: z.enum(SERIOUS_INCIDENT_CATEGORY_VALUES).optional(),
  followUpTodos: z
    .array(
      z.object({
        title: z.string().min(3).max(140),
        dueInDays: z.union([z.literal(1), z.literal(3), z.literal(7)]),
      }),
    )
    .max(4),
  parentNoticeDraft: z.string().max(2000).optional(),
  regulatorPackDraft: z.string().max(6000).optional(),
});
export type ModelAssessment = z.infer<typeof assessmentSchema>;

// ── Redaction ────────────────────────────────────────────────────────

const NAME_RUN = /\b[A-Z][A-Za-z'’-]*(?:\s+[A-Z][A-Za-z'’-]*)*/g;

/**
 * Witness fields are free text ("Seen by Sarah Lee and a parent"). We cannot
 * parse names out of that reliably, so every run of capitalised words becomes
 * "[name]". Over-redacting a sentence-initial word is the cheap side to err on.
 */
function redactNames(text: string | null | undefined): string | null {
  if (!text) return null;
  return text.replace(NAME_RUN, "[name]");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function nameTokens(name: string | null | undefined): string[] {
  return (name ?? "").split(/\s+/).filter(Boolean);
}

/**
 * Lines that are nothing but a name label. The cowork incident route folds
 * `Witnesses: …` into `actionTaken` and prefixes `Reported by: <name>` to the
 * description; neither name is in any field the known-name scrub knows about,
 * so those lines are dropped whole.
 */
const NAME_LABEL_LINE = /^[ \t]*(?:Reported by|Witness(?:es)?)[ \t]*:.*$/gim;

function stripNameLabelLines(text: string): string {
  return text
    .replace(NAME_LABEL_LINE, "")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/**
 * Build a scrubber for the free-text fields (description, summary, …) which
 * staff routinely write the surname into. `terms` are the known identifying
 * strings for this record; matches become "[name]". `Reported by:` /
 * `Witnesses:` lines are removed first (`stripNameLabelLines`).
 */
function makeScrubber(terms: Array<string | null | undefined>): (text: string | null | undefined) => string | null {
  const parts = Array.from(
    new Set(terms.map((t) => t?.trim()).filter((t): t is string => !!t && t.length >= 2)),
  )
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp);
  const re = parts.length ? new RegExp(`(?<![\\w@.])(?:${parts.join("|")})(?![\\w@])`, "gi") : null;
  return (text) => {
    if (!text) return null;
    const stripped = stripNameLabelLines(text);
    if (!stripped) return null;
    return re ? stripped.replace(re, "[name]") : stripped;
  };
}

function iso(d: Date | string | null | undefined): string | null {
  if (!d) return null;
  const date = d instanceof Date ? d : new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/**
 * Strip everything that identifies a person before the record reaches the
 * model, keeping every fact needed to judge severity. The model gets a first
 * name only (a draft needs something to address) and never a surname, a
 * contact detail, a signature or a witness name. Presence flags stand in for
 * dropped fields the model must still be able to call "missing".
 */
export function redactForModel(subject: TriageSubject): Record<string, unknown> {
  const service = { name: subject.service.name, state: subject.service.state };

  if (subject.type === "incident") {
    const r = subject.record;
    const scrub = makeScrubber(nameTokens(r.childName).slice(1).concat(nameTokens(r.parentNotifiedName)));
    return {
      type: "incident",
      service,
      childFirstName: subject.childFirstName,
      childAge: r.childAge ?? null,
      incidentDate: iso(r.incidentDate),
      incidentType: r.incidentType,
      severity: r.severity,
      location: r.location ?? null,
      timeOfDay: r.timeOfDay ?? null,
      description: scrub(r.description),
      circumstances: scrub(r.circumstances),
      actionTaken: scrub(r.actionTaken),
      firstAidGiven: r.firstAidGiven ?? false,
      firstAidDetails: scrub(r.firstAidDetails),
      medicalPersonnelContacted: scrub(r.medicalPersonnelContacted),
      ambulanceCalled: r.ambulanceCalled ?? false,
      witnesses: redactNames(r.witnesses),
      parentNotified: r.parentNotified ?? false,
      parentNotifiedAt: iso(r.parentNotifiedAt),
      parentNotifiedNameRecorded: !!r.parentNotifiedName,
      parentNotifiedMethod: r.parentNotifiedMethod ?? null,
      reportableToAuthority: r.reportableToAuthority ?? false,
      seriousIncidentCategory: r.seriousIncidentCategory ?? null,
      becameAwareAt: iso(r.becameAwareAt),
      followUpRequired: r.followUpRequired ?? false,
    };
  }

  if (subject.type === "complaint") {
    const r = subject.record;
    const scrub = makeScrubber([
      ...nameTokens(r.complainantName),
      r.complainantEmail,
      r.complainantPhone,
      ...nameTokens(r.childName).slice(1),
    ]);
    return {
      type: "complaint",
      service,
      receivedAt: iso(r.receivedAt),
      source: r.source ?? null,
      anonymous: r.anonymous ?? false,
      childFirstName: nameTokens(r.childName)[0] ?? null,
      category: r.category,
      summary: scrub(r.summary),
      details: scrub(r.details),
      notifiable: r.notifiable ?? false,
      notifiableReason: r.notifiableReason ?? null,
      becameAwareAt: iso(r.becameAwareAt),
      status: r.status ?? null,
    };
  }

  const r = subject.record;
  const scrub = makeScrubber([...nameTokens(r.staffName).slice(1), ...nameTokens(r.witnessNames)]);
  return {
    type: "staff_incident",
    service,
    staffFirstName: nameTokens(r.staffName)[0] ?? null,
    occurredAt: iso(r.occurredAt),
    incidentType: r.incidentType,
    severity: r.severity,
    location: r.location ?? null,
    description: scrub(r.description),
    bodyPart: r.bodyPart ?? null,
    treatment: scrub(r.treatment),
    witnesses: redactNames(r.witnessNames),
    reportableToAuthority: r.reportableToAuthority ?? false,
    workersCompClaim: r.workersCompClaim ?? false,
    followUpRequired: r.followUpRequired ?? false,
  };
}

// ── Assessment ───────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 20_000;

export type AssessmentResult =
  | { ok: true; data: ModelAssessment; modelId: string; inputTokens: number; outputTokens: number; durationMs: number }
  | { ok: false; error: string };

/**
 * Ask the model to critique the rules result. Runs AFTER alerts have gone
 * out, so any failure (no API key, bad JSON after the repair pass, timeout)
 * is returned as `ok: false` and the caller falls back to a rules-only
 * assessment. Never throws.
 *
 * The provider takes no abort signal, so the timeout races the call against a
 * timer; a late result is ignored and the timer is always cleared.
 */
export async function assessWithModel(
  subject: TriageSubject,
  rules: RulesResult,
  opts: { timeoutMs?: number } = {},
): Promise<AssessmentResult> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const startedAt = Date.now();
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    const prompt = buildAssessmentPrompt(redactForModel(subject), rules);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`Model assessment timed out after ${timeoutMs}ms`)),
        timeoutMs,
      );
    });
    const result = await Promise.race([
      generateStructured({
        system: KNOX_SYSTEM_PROMPT,
        prompt,
        schema: assessmentSchema,
        maxTokens: 1500,
        temperature: 0.2,
      }),
      timeout,
    ]);
    return {
      ok: true,
      data: result.data,
      modelId: result.modelId,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      durationMs: Date.now() - startedAt,
    };
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    logger.warn("Knox model assessment failed", {
      subjectType: subject.type,
      recordId: subject.record.id,
      durationMs: Date.now() - startedAt,
      error,
    });
    return { ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}
