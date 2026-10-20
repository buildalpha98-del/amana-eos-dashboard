/**
 * Knox UI wording — pure, client-safe (no Prisma, no I/O).
 *
 * Knox is a label on an audit trail, not a chatbot: the copy says
 * "Knox flagged …" / "Knox suggests …", in plain words.
 */

export type KnoxTier = "minor" | "moderate" | "serious";
export type KnoxSubjectType = "incident" | "complaint" | "staff_incident";

const SUBJECT_TYPES: readonly KnoxSubjectType[] = ["incident", "complaint", "staff_incident"];

/** Rule ids (src/lib/knox/rules.ts) in lower-case plain words for a headline. */
const RULE_PHRASES: Record<string, string> = {
  ambulance_called: "ambulance called",
  missing_child: "missing child",
  stated_serious: "marked serious by the educator",
  reportable_flag: "flagged as reportable to the regulator",
  medical_contacted: "medical personnel contacted",
  medication_error: "medication error",
  stated_moderate: "marked moderate by the educator",
  complaint_notifiable: "complaint alleges a serious incident or a breach of the Law",
  complaint_escalated: "complaint escalated",
  complaint_sensitive: "child safety, supervision or staff conduct complaint",
  staff_notifiable: "serious or notifiable staff incident",
  staff_moderate: "moderate staff incident",
};

export function ruleHitPhrase(id: string): string {
  return RULE_PHRASES[id] ?? id.replace(/_/g, " ").trim();
}

/** "Knox flagged: ambulance called; medication error" */
export function flaggedHeadline(ruleHits: readonly string[], tier: KnoxTier): string {
  if (ruleHits.length === 0) {
    return tier === "minor" ? "Knox found nothing that needs escalating" : `Knox rated this ${tier}`;
  }
  return `Knox flagged: ${ruleHits.map(ruleHitPhrase).join("; ")}`;
}

export const CLOCK_LABELS: Record<string, string> = {
  parent_24h: "Parent notice",
  regulator: "Regulator notice",
  complaint_regulator: "Complaint to regulator",
};

export function clockLabel(kind: string): string {
  return CLOCK_LABELS[kind] ?? kind.replace(/_/g, " ");
}

function duration(ms: number): string {
  const totalMin = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(totalMin / 1440);
  const hours = Math.floor((totalMin % 1440) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

/**
 * "due in 3h 12m" / "OVERDUE by 40m". Overdue when the stored flag says so
 * OR the due time has passed since the assessment was written.
 */
export function formatCountdown(
  dueAt: string,
  now: number,
  storedOverdue = false,
): { text: string; overdue: boolean } {
  const due = new Date(dueAt).getTime();
  if (Number.isNaN(due)) return { text: "no due time", overdue: storedOverdue };
  const diff = due - now;
  const overdue = storedOverdue || diff < 0;
  if (overdue) return { text: `OVERDUE by ${duration(Math.abs(Math.min(diff, 0)))}`, overdue: true };
  return { text: `due in ${duration(diff)}`, overdue: false };
}

/** Replace `{{child_name}}` with the first token of the child's name, when known. */
export function fillChildName(draft: string, childName?: string | null): string {
  const first = childName?.trim().split(/\s+/)[0];
  if (!first) return draft;
  return draft.replace(/\{\{\s*child_name\s*\}\}/g, first);
}

/**
 * The to-dos a `create_followup_todos` card would create, one line each —
 * "Ring the family (due in 1 day)" — so they are seen before Approve. Reads
 * the card's stored `payload.todos`; malformed entries are dropped.
 */
export function followUpTodoLines(payload: unknown): string[] {
  if (!payload || typeof payload !== "object") return [];
  const todos = (payload as { todos?: unknown }).todos;
  if (!Array.isArray(todos)) return [];
  return todos.flatMap((t): string[] => {
    if (!t || typeof t !== "object") return [];
    const { title, dueInDays } = t as { title?: unknown; dueInDays?: unknown };
    if (typeof title !== "string" || !title.trim()) return [];
    if (typeof dueInDays !== "number" || !Number.isFinite(dueInDays)) return [title.trim()];
    return [`${title.trim()} (due in ${dueInDays} day${dueInDays === 1 ? "" : "s"})`];
  });
}

/** `<type>:<id>` → parts, or null when malformed / unknown type. */
export function parseSubjectRef(raw: string | null | undefined): { type: KnoxSubjectType; id: string } | null {
  if (!raw) return null;
  const idx = raw.indexOf(":");
  if (idx <= 0) return null;
  const type = SUBJECT_TYPES.find((t) => t === raw.slice(0, idx));
  const id = raw.slice(idx + 1).trim();
  if (!type || !id) return null;
  return { type, id };
}

export const SUBJECT_LABELS: Record<KnoxSubjectType, string> = {
  incident: "Incident",
  complaint: "Complaint",
  staff_incident: "Staff incident",
};

/** Where a subject's own record lives (mirrors alerts.ts `recordLink`). */
export function subjectHref(type: KnoxSubjectType, id: string, assessmentId?: string): string {
  if (type === "incident") {
    return assessmentId ? `/incidents?knox=${assessmentId}&incident=${id}` : `/incidents?incident=${id}`;
  }
  return `/knox?subject=${type}:${id}`;
}

const WHEN_FMT = new Intl.DateTimeFormat("en-AU", {
  timeZone: "Australia/Sydney",
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

/** "Tue 20 Oct, 2:30 pm" in service (Sydney) time; empty for an invalid date. */
export function formatKnoxTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : WHEN_FMT.format(d);
}
