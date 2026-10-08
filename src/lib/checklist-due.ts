/**
 * Checklist due times (2026-10-08, after OWNA's per-checklist "Due Time"
 * and its daily "2 of 8 signed off" report).
 *
 * A centre's daily checklist is one row per session, split into SECTIONS
 * by item category (opening, safety, programming, closing…). A centre may
 * give any section a due time per session in Settings → Checklists. Pure
 * functions here; the overdue cron and the Today card both read them.
 */
import type { ChecklistDueTimes } from "@/lib/app-settings";

export type ChecklistSession = "bsc" | "asc" | "vc";

export interface ChecklistLike {
  sessionType: string;
  items: { category: string; checked: boolean; isRequired: boolean }[];
}

export interface SectionStatus {
  sessionType: ChecklistSession;
  category: string;
  done: number;
  total: number;
  /** "HH:mm", when the centre set one. */
  due: string | null;
  /** Past due with required items still unticked. */
  overdue: boolean;
  /** No checklist row at all for this session today. */
  missing: boolean;
}

export const SESSION_LABELS: Record<ChecklistSession, string> = {
  bsc: "Before school",
  asc: "After school",
  vc: "Vacation care",
};

export function sectionLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1).replace(/_/g, " ");
}

/**
 * Every section of today's checklists, plus any section that has a due
 * time but no checklist row yet (so "not started" is visible, not silent).
 */
export function checklistStatus(
  checklists: ChecklistLike[],
  dueTimes: ChecklistDueTimes,
  nowHHmm: string,
  /**
   * Sessions actually running today (someone rostered). A due time on a
   * session that isn't on — vacation care in term — must not report a
   * "missing" checklist every day.
   */
  runningSessions: ReadonlySet<string>,
): SectionStatus[] {
  const out: SectionStatus[] = [];
  const seen = new Set<string>();

  for (const c of checklists) {
    const st = c.sessionType as ChecklistSession;
    const byCat = new Map<string, { done: number; total: number; requiredLeft: number }>();
    for (const i of c.items) {
      const agg = byCat.get(i.category) ?? { done: 0, total: 0, requiredLeft: 0 };
      agg.total += 1;
      if (i.checked) agg.done += 1;
      else if (i.isRequired) agg.requiredLeft += 1;
      byCat.set(i.category, agg);
    }
    for (const [category, agg] of byCat) {
      const due = dueTimes[st]?.[category] ?? null;
      seen.add(`${st}:${category}`);
      out.push({
        sessionType: st,
        category,
        done: agg.done,
        total: agg.total,
        due,
        overdue: !!due && nowHHmm >= due && agg.requiredLeft > 0,
        missing: false,
      });
    }
  }

  const present = new Set(checklists.map((c) => c.sessionType));
  for (const [st, cats] of Object.entries(dueTimes) as [ChecklistSession, Record<string, string>][]) {
    for (const [category, due] of Object.entries(cats ?? {})) {
      if (seen.has(`${st}:${category}`)) continue;
      // A session with a checklist but no such section: nothing to chase.
      if (present.has(st)) continue;
      if (!runningSessions.has(st)) continue;
      out.push({
        sessionType: st,
        category,
        done: 0,
        total: 0,
        due,
        overdue: nowHHmm >= due,
        missing: true,
      });
    }
  }
  return out;
}

/** Dedupe key for one overdue reminder — one per section per day. */
export function overdueTitle(centreName: string, s: SectionStatus): string {
  return `${sectionLabel(s.category)} checklist overdue — ${centreName} (${SESSION_LABELS[s.sessionType] ?? s.sessionType})`;
}
