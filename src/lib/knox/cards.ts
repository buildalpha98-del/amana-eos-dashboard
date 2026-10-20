import type { Prisma, TriageSubjectType } from "@prisma/client";
import { isSeriousIncidentCategory } from "@/lib/compliance-clocks";
import type { ModelAssessment } from "@/lib/knox/assess";
import type { RulesResult, TriageSubject } from "@/lib/knox/types";

/**
 * Pure half of Knox's cards: decide which changes to propose after an
 * assessment. Nothing here touches the database; `actions.ts` executes them.
 */

export const CARD_TTL_MS = 72 * 60 * 60 * 1000;

export type CardKind =
  | "set_severity"
  | "mark_reportable"
  | "mark_notifiable"
  | "create_followup_todos";

export interface Card {
  kind: CardKind;
  payload: Record<string, unknown>;
  summary: string;
  rationale: string | null;
}

/** `minor < moderate < serious < reportable`. Unknown strings rank below all. */
const SEVERITY_RANK: Record<string, number> = { minor: 0, moderate: 1, serious: 2, reportable: 3 };
export const severityRank = (s: string | null | undefined): number =>
  s !== null && s !== undefined && s in SEVERITY_RANK ? SEVERITY_RANK[s] : -1;

const NOTIFIABLE_REASON_LABEL: Record<string, string> = {
  serious_incident: "serious incident",
  law_contravention: "law contravention",
};

export function buildCards(args: {
  subject: TriageSubject;
  rules: RulesResult;
  model: ModelAssessment | null;
  now: Date;
}): Card[] {
  const { subject, rules, model, now } = args;
  const rationale = model?.rationale ?? null;
  const cards: Card[] = [];

  if (subject.type === "incident") {
    const record = subject.record;

    // One-way ratchet: Knox only ever proposes raising a stated severity.
    if (
      model?.severityOpinion === "understated" &&
      model.suggestedSeverity &&
      severityRank(model.suggestedSeverity) > severityRank(record.severity)
    ) {
      cards.push({
        kind: "set_severity",
        payload: { severity: model.suggestedSeverity },
        summary: `Severity: ${record.severity} → ${model.suggestedSeverity}`,
        rationale,
      });
    }

    const category = model?.suggestedCategory;
    if (rules.tier === "serious" && !record.reportableToAuthority && isSeriousIncidentCategory(category)) {
      cards.push({
        kind: "mark_reportable",
        payload: {
          reportableToAuthority: true,
          seriousIncidentCategory: category,
          // Keep an earlier recorded awareness time: overwriting it would push
          // out the regulator notification clock.
          becameAwareAt: (record.becameAwareAt ?? now).toISOString(),
        },
        summary: `Mark reportable to the regulator (${category.replace(/_/g, " ")})`,
        rationale,
      });
    }
  }

  if (subject.type === "complaint") {
    const record = subject.record;
    if (
      !record.notifiable &&
      (rules.ruleHits.includes("complaint_sensitive") || model?.severityOpinion === "understated")
    ) {
      const reason = model?.suggestedCategory ? "serious_incident" : "law_contravention";
      cards.push({
        kind: "mark_notifiable",
        payload: {
          notifiable: true,
          notifiableReason: reason,
          becameAwareAt: (record.becameAwareAt ?? now).toISOString(),
        },
        summary: `Mark complaint notifiable (${NOTIFIABLE_REASON_LABEL[reason]})`,
        rationale,
      });
    }
  }

  // Every subject type, staff incidents included, can get follow-up to-dos.
  if (model && model.followUpTodos.length > 0) {
    const todos = model.followUpTodos.map((t) => ({ title: t.title, dueInDays: t.dueInDays }));
    cards.push({
      kind: "create_followup_todos",
      payload: { todos },
      summary: `Create ${todos.length} follow-up to-do${todos.length === 1 ? "" : "s"}`,
      rationale,
    });
  }

  return cards;
}

/** The row the worker inserts for a card. `expiresAt = now + CARD_TTL_MS`. */
export function toPendingActionCreate(
  card: Card,
  ctx: {
    assessmentId: string | null;
    subjectType: TriageSubjectType;
    subjectId: string;
    serviceId: string;
    now: Date;
  },
): Prisma.PendingActionCreateManyInput {
  return {
    proposedBy: "knox",
    serviceId: ctx.serviceId,
    kind: card.kind,
    subjectType: ctx.subjectType,
    subjectId: ctx.subjectId,
    payload: card.payload as Prisma.InputJsonObject,
    summary: card.summary,
    rationale: card.rationale,
    assessmentId: ctx.assessmentId,
    expiresAt: new Date(ctx.now.getTime() + CARD_TTL_MS),
  };
}

