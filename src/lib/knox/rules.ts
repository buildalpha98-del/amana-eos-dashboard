/**
 * Knox rules and clocks — the deterministic layer.
 *
 * Pure: no I/O, no logging. Given a loaded record it decides the tier
 * (minor < moderate < serious), records EVERY rule that fired so the card
 * and the Teams message can say why, and computes the regulatory clocks.
 * The model may escalate the tier later; it can never lower what these
 * rules decided.
 */
import {
  NOTIFICATION_WINDOW_HOURS,
  isSeriousIncidentCategory,
  notificationDueAt,
  requiresRegulatorNotification,
  type SeriousIncidentCategory,
} from "@/lib/compliance-clocks";
import type { TriageTier } from "@prisma/client";
import {
  TIER_RANK,
  type RulesResult,
  type TriageClock,
  type TriageSubject,
} from "./types";

const HOUR_MS = 60 * 60 * 1000;

/**
 * Hours the service has to tell the Regulatory Authority, by Reg 12
 * serious-incident category, counted from when it BECAME AWARE.
 *
 * Every entry is 24: Reg 176(2)(a) gives 24 hours for a serious incident
 * under Reg 12, and none of the six categories is one the regulation
 * carves out for a longer window. Kept as a map (not a constant) so a
 * later correction for a single category is a one-line change.
 */
export const REGULATOR_WINDOW_HOURS: Record<SeriousIncidentCategory, number> = {
  death: 24, // Reg 176(2)(a)
  serious_injury: 24, // Reg 176(2)(a)
  serious_illness: 24, // Reg 176(2)(a)
  missing_child: 24, // Reg 176(2)(a)
  unauthorised_removal: 24, // Reg 176(2)(a)
  locked_in_or_out: 24, // Reg 176(2)(a)
};

/**
 * When the Regulatory Authority must be told: the awareness time (falling
 * back to when the record was created, if awareness was never stamped)
 * plus the category's window. An unknown or missing category uses the
 * standard 24 hours rather than no deadline at all.
 */
export function regulatorDueAt(
  category: string | null,
  becameAwareAt: Date | null,
  createdAt: Date,
): Date | null {
  const base = becameAwareAt ?? createdAt;
  if (!base || Number.isNaN(base.getTime())) return null;
  const hours = isSeriousIncidentCategory(category)
    ? REGULATOR_WINDOW_HOURS[category]
    : NOTIFICATION_WINDOW_HOURS;
  return new Date(base.getTime() + hours * HOUR_MS);
}

function clock(
  kind: TriageClock["kind"],
  due: Date,
  basis: string,
  now: Date,
): TriageClock {
  return {
    kind,
    dueAt: due.toISOString(),
    basis,
    overdue: due.getTime() < now.getTime(),
  };
}

function nonEmpty(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

interface Hit {
  rule: string;
  tier: TriageTier;
}

function tierHits(subject: TriageSubject): Hit[] {
  const hits: Hit[] = [];
  const add = (cond: boolean, rule: string, tier: TriageTier) => {
    if (cond) hits.push({ rule, tier });
  };

  switch (subject.type) {
    case "incident": {
      const r = subject.record;
      add(r.ambulanceCalled, "ambulance_called", "serious");
      add(r.incidentType === "missing_child", "missing_child", "serious");
      add(r.severity === "serious" || r.severity === "reportable", "stated_serious", "serious");
      add(
        r.reportableToAuthority || nonEmpty(r.seriousIncidentCategory),
        "reportable_flag",
        "serious",
      );
      add(nonEmpty(r.medicalPersonnelContacted), "medical_contacted", "moderate");
      add(r.incidentType === "medication_error", "medication_error", "moderate");
      add(r.severity === "moderate", "stated_moderate", "moderate");
      break;
    }
    case "complaint": {
      const r = subject.record;
      add(r.notifiable, "complaint_notifiable", "serious");
      add(r.status === "escalated", "complaint_escalated", "serious");
      add(
        r.category === "child_safety" ||
          r.category === "supervision" ||
          r.category === "staff_conduct",
        "complaint_sensitive",
        "moderate",
      );
      break;
    }
    case "staff_incident": {
      const r = subject.record;
      add(
        r.severity === "serious" || r.severity === "notifiable" || r.reportableToAuthority,
        "staff_notifiable",
        "serious",
      );
      add(r.severity === "moderate", "staff_moderate", "moderate");
      break;
    }
  }
  return hits;
}

function clocksFor(subject: TriageSubject, now: Date): TriageClock[] {
  const clocks: TriageClock[] = [];

  if (subject.type === "incident") {
    const r = subject.record;

    if (!r.parentNotified) {
      const due = notificationDueAt(r.incidentDate);
      if (due) clocks.push(clock("parent_24h", due, "Reg 86", now));
    }

    if (requiresRegulatorNotification(r) && !r.reportedToAuthorityAt) {
      const due = regulatorDueAt(r.seriousIncidentCategory, r.becameAwareAt, r.createdAt);
      if (due) clocks.push(clock("regulator", due, "Reg 176(2)(a)", now));
    }
  }

  if (subject.type === "complaint") {
    const r = subject.record;
    if (r.notifiable && !r.regulatorNotifiedAt) {
      // The deadline is stamped at intake and deliberately not recomputed
      // (the register is evidence). Derive only if it was never stamped.
      const due = r.notificationDueAt ?? notificationDueAt(r.becameAwareAt ?? r.receivedAt);
      if (due) clocks.push(clock("complaint_regulator", due, "s.174(2)(b)", now));
    }
  }

  return clocks;
}

export function evaluateRules(subject: TriageSubject, now: Date): RulesResult {
  const hits = tierHits(subject);
  const tier = hits.reduce<TriageTier>(
    (max, h) => (TIER_RANK[h.tier] > TIER_RANK[max] ? h.tier : max),
    "minor",
  );
  return {
    tier,
    ruleHits: hits.map((h) => h.rule),
    clocks: clocksFor(subject, now),
  };
}
