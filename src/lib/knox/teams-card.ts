import type { TriageTier } from "@prisma/client";
import type { RulesResult, TriageClock, TriageSubject } from "@/lib/knox/types";

/** Knox alert content: what the push and the Teams card say. Pure, no I/O. */

const ACCENT: Record<"moderate" | "serious", string> = {
  moderate: "#d97706",
  serious: "#dc2626",
};

const SERVICE_TZ = "Australia/Sydney";

const RULE_LABELS: Record<string, string> = {
  ambulance_called: "Ambulance called",
  missing_child: "Missing child",
  stated_serious: "Marked serious by the educator",
  reportable_flag: "Flagged as reportable to the regulator",
  medical_contacted: "Medical personnel contacted",
  medication_error: "Medication error",
  stated_moderate: "Marked moderate by the educator",
  complaint_notifiable: "Complaint alleges a serious incident or a breach of the Law",
  complaint_escalated: "Complaint escalated",
  complaint_sensitive: "Child safety, supervision or staff conduct complaint",
  staff_notifiable: "Serious or notifiable staff incident",
  staff_moderate: "Moderate staff incident",
};

const CLOCK_LABELS: Record<TriageClock["kind"], string> = {
  parent_24h: "Parent notice",
  regulator: "Regulator notice",
  complaint_regulator: "Complaint to regulator",
};

// ── Card content ─────────────────────────────────────────

function sydneyParts(date: Date, opts: Intl.DateTimeFormatOptions): Record<string, string> {
  const parts = new Intl.DateTimeFormat("en-AU", {
    timeZone: SERVICE_TZ,
    hourCycle: "h23",
    ...opts,
  }).formatToParts(date);
  return Object.fromEntries(parts.map((p) => [p.type, p.value]));
}

/** "Tue 20 Oct, 14:30" in Sydney time. */
function formatWhen(date: Date): string {
  const p = sydneyParts(date, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
  return `${p.weekday} ${p.day} ${p.month}, ${p.hour}:${p.minute}`;
}

/** "due 14:30 20 Oct" in Sydney time. */
function formatDue(date: Date): string {
  const p = sydneyParts(date, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  return `due ${p.hour}:${p.minute} ${p.day} ${p.month}`;
}

function clockValue(clock: TriageClock, now: number): string {
  const due = new Date(clock.dueAt);
  const overdue = clock.overdue || due.getTime() < now;
  return `${overdue ? "OVERDUE" : formatDue(due)} (${clock.basis})`;
}

function humanise(slug: string): string {
  const s = slug.replace(/_/g, " ").trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function subjectLabel(subject: TriageSubject): string {
  switch (subject.type) {
    case "incident":
      return `${humanise(subject.record.incidentType)} incident`;
    case "complaint":
      return `Complaint (${humanise(subject.record.category).toLowerCase()})`;
    case "staff_incident":
      return "Staff incident";
  }
}

function subjectWhen(subject: TriageSubject): Date {
  switch (subject.type) {
    case "incident":
      return subject.record.incidentDate;
    case "complaint":
      return subject.record.receivedAt;
    case "staff_incident":
      return subject.record.occurredAt;
  }
}

function tierWord(tier: TriageTier): string {
  return tier.toUpperCase();
}

export interface AlertContent {
  title: string;
  body: string;
  facts: { title: string; value: string }[];
  accentColor: string;
}

export function buildContent(
  subject: TriageSubject,
  rules: RulesResult,
  level: 0 | 1 | 2,
  rationale: string | null | undefined,
): AlertContent {
  const now = Date.now();
  const type = subjectLabel(subject);
  const why = rules.ruleHits.map((h) => RULE_LABELS[h] ?? humanise(h)).join("; ");
  const prefix =
    level === 0
      ? `Knox ${tierWord(rules.tier)}`
      : `Knox ESCALATION ${level} (${tierWord(rules.tier)}, not acknowledged)`;

  const facts = [
    { title: "Centre", value: subject.service.name },
    { title: "Type", value: type },
    { title: "When", value: formatWhen(subjectWhen(subject)) },
    ...rules.clocks.map((c) => ({
      title: CLOCK_LABELS[c.kind] ?? humanise(c.kind),
      value: clockValue(c, now),
    })),
    ...(why ? [{ title: "Why flagged", value: why }] : []),
  ];

  const lines = [
    level === 0
      ? `${type} at ${subject.service.name} needs review.`
      : `${type} at ${subject.service.name} has not been acknowledged.`,
  ];
  if (rationale?.trim()) lines.push(`Knox note: ${rationale.trim()}`);

  return {
    title: `${prefix}: ${subject.service.name}`,
    body: lines.join("\n\n"),
    facts,
    accentColor: rules.tier === "serious" ? ACCENT.serious : ACCENT.moderate,
  };
}
