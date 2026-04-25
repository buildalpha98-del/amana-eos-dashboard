/**
 * Australian school term boundaries.
 *
 * Boundaries are approximate mid-term dates used for tile term-scoping — they do not
 * need to match a specific state's education-department calendar exactly. If a date
 * falls outside any term window (e.g. mid-holidays), we attribute it to the nearest
 * upcoming term so the cockpit never shows "no current term".
 */

export type SchoolTerm = {
  year: number;
  term: 1 | 2 | 3 | 4;
  /** Inclusive start of term (local wall-clock midnight). */
  startsOn: Date;
  /** Inclusive end of term (local wall-clock 23:59:59.999). */
  endsOn: Date;
};

// NSW public school term dates (typical — adjust per year as needed).
// Sprint 2 only needs 2026 locked in; years beyond can be approximated.
const TERM_TABLE: Record<number, Array<{ term: 1 | 2 | 3 | 4; start: string; end: string }>> = {
  2026: [
    { term: 1, start: "2026-01-28", end: "2026-04-10" },
    { term: 2, start: "2026-04-28", end: "2026-07-03" },
    { term: 3, start: "2026-07-21", end: "2026-09-25" },
    { term: 4, start: "2026-10-13", end: "2026-12-18" },
  ],
  2027: [
    { term: 1, start: "2027-01-27", end: "2027-04-02" },
    { term: 2, start: "2027-04-19", end: "2027-06-25" },
    { term: 3, start: "2027-07-12", end: "2027-09-17" },
    { term: 4, start: "2027-10-05", end: "2027-12-17" },
  ],
};

function atStartOfDay(iso: string): Date {
  return new Date(`${iso}T00:00:00`);
}

function atEndOfDay(iso: string): Date {
  return new Date(`${iso}T23:59:59.999`);
}

export function getTermsForYear(year: number): SchoolTerm[] {
  const raw = TERM_TABLE[year];
  if (!raw) {
    // Fallback: approximate if year not in table. Uses rough quarter boundaries.
    const fallback: SchoolTerm[] = [
      { year, term: 1, startsOn: atStartOfDay(`${year}-01-28`), endsOn: atEndOfDay(`${year}-04-10`) },
      { year, term: 2, startsOn: atStartOfDay(`${year}-04-28`), endsOn: atEndOfDay(`${year}-07-03`) },
      { year, term: 3, startsOn: atStartOfDay(`${year}-07-21`), endsOn: atEndOfDay(`${year}-09-25`) },
      { year, term: 4, startsOn: atStartOfDay(`${year}-10-13`), endsOn: atEndOfDay(`${year}-12-18`) },
    ];
    return fallback;
  }
  return raw.map((r) => ({
    year,
    term: r.term,
    startsOn: atStartOfDay(r.start),
    endsOn: atEndOfDay(r.end),
  }));
}

/**
 * Return the term that `date` falls within. If the date is in a school-holiday
 * window, returns the upcoming term (so "current term" always has a value).
 */
export function getCurrentTerm(date: Date = new Date()): SchoolTerm {
  const year = date.getFullYear();
  const terms = getTermsForYear(year);

  for (const term of terms) {
    if (date >= term.startsOn && date <= term.endsOn) {
      return term;
    }
  }

  // Not inside any term — find the next upcoming one this year.
  const next = terms.find((t) => date < t.startsOn);
  if (next) return next;

  // Past end of Term 4 — return Term 1 of next year.
  const nextYearTerms = getTermsForYear(year + 1);
  return nextYearTerms[0];
}

export function getNextTerm(date: Date = new Date()): SchoolTerm {
  const current = getCurrentTerm(date);
  const terms = getTermsForYear(current.year);
  if (current.term < 4) {
    return terms[current.term]; // term 1 → index 1 = term 2, etc.
  }
  return getTermsForYear(current.year + 1)[0];
}

const NEWSLETTER_CHASE_DAY_MS = 24 * 60 * 60 * 1000;

export interface NewsletterChaseEligibility {
  eligible: boolean;
  currentTerm: { year: number; number: 1 | 2 | 3 | 4 } | null;
  nextTerm: { year: number; number: 1 | 2 | 3 | 4 } | null;
  weeksUntilTermEnd: number | null;
}

/**
 * Whether `date` falls in a newsletter-chase week — defined as the last 1–2
 * full weeks of the *current* term. Holidays-between-terms return ineligible.
 *
 * Returns rich context so the cron can build a prompt without re-resolving terms.
 */
export function isNewsletterChaseWeek(date: Date = new Date()): NewsletterChaseEligibility {
  const year = date.getFullYear();
  const terms = getTermsForYear(year);
  const inTerm = terms.find((t) => date >= t.startsOn && date <= t.endsOn);

  if (!inTerm) {
    return { eligible: false, currentTerm: null, nextTerm: null, weeksUntilTermEnd: null };
  }

  const msUntilEnd = inTerm.endsOn.getTime() - date.getTime();
  const daysUntilEnd = Math.floor(msUntilEnd / NEWSLETTER_CHASE_DAY_MS);
  // Bucket "weeks remaining": 0–6 days left → 1, 7–13 → 2, 14–20 → 3, etc.
  const weeksUntilEnd = Math.floor(daysUntilEnd / 7) + 1;

  const next = getNextTerm(date);

  return {
    eligible: weeksUntilEnd === 1 || weeksUntilEnd === 2,
    currentTerm: { year: inTerm.year, number: inTerm.term },
    nextTerm: { year: next.year, number: next.term },
    weeksUntilTermEnd: weeksUntilEnd,
  };
}
