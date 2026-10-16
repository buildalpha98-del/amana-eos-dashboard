/**
 * Automatic candidate fit (Daniel, 16 Oct 2026): "it should automatically be
 * able to pick out who's a good candidate". A transparent rule-based score —
 * every point has a reason staff can read and check — rather than an opaque
 * AI judgement. Computed when someone applies, and again when their details
 * change. The optional AI résumé screen stays a separate, manual tool.
 *
 * Hard rules first:
 *   - no right to work in Australia → not eligible;
 *   - a Victorian ad that needs a diploma-level educator (Education and Care
 *     Services National Regulations, reg 356 — ACECQA's Victorian list for
 *     over-preschool-age children) → a candidate without one is not eligible
 *     for THAT ad (they may still suit a Cert III-level role).
 * Then points out of 100 for qualification, availability, WWCC, location,
 * experience, first aid and transport.
 */
import type { QualificationType } from "@prisma/client";

export type FitLabel = "strong" | "good" | "possible" | "not_eligible";

export const FIT_LABELS: Record<FitLabel, string> = {
  strong: "Strong match",
  good: "Good match",
  possible: "Possible",
  not_eligible: "Not eligible",
};

export interface FitVacancy {
  /** "NSW" | "VIC" — the ad's own state, else its centre's. */
  state: string | null;
  qualificationRequired: string | null; // none | cert_iii | diploma
  /** True for Holiday Quest / vacation care ads. */
  holiday: boolean;
}

export interface FitCandidate {
  state: string | null;
  qualification: QualificationType | null;
  studying: boolean;
  vicDiplomaLevel: boolean | null;
  wwccNumber: string | null;
  hasFirstAid: boolean;
  rightToWork: string | null;
  yearsExperience: number | null;
  previousRole: string | null;
  holidayWeeks: number | null;
  availableSessions: string[];
  availableDays: string[];
  hasTransport: boolean;
}

export interface FitResult {
  score: number;
  label: FitLabel;
  reasons: string[];
}

const DIPLOMA_OR_ABOVE: (QualificationType | null)[] = ["diploma", "bachelor", "masters"];
const CERT_III_OR_ABOVE: (QualificationType | null)[] = ["cert_iii", ...DIPLOMA_OR_ABOVE];

export function vacancyIsHoliday(v: { title?: string | null; workPeriod?: string | null; notes?: string | null }): boolean {
  return /holiday quest|vacation care|school holidays/i.test(`${v.title ?? ""} ${v.workPeriod ?? ""}`);
}

export function scoreCandidate(v: FitVacancy, c: FitCandidate): FitResult {
  const reasons: string[] = [];
  let score = 0;
  let gate: string | null = null;

  // ── Hard rules ──
  if (c.rightToWork === "no_rights") gate = "No right to work in Australia";

  const vicDiplomaAd = v.state === "VIC" && v.qualificationRequired === "diploma";
  let qualPoints = 0;
  if (vicDiplomaAd) {
    if (c.vicDiplomaLevel) {
      qualPoints = 35;
      reasons.push(c.studying ? "Studying a Victorian diploma-level qualification" : "Holds a Victorian diploma-level qualification");
    } else if (DIPLOMA_OR_ABOVE.includes(c.qualification)) {
      qualPoints = 20;
      reasons.push("Has a diploma or degree — check it's on Victoria's diploma-level list");
    } else {
      gate ??= "This ad needs a diploma-level qualification (Victoria) — could suit a Cert III-level role";
    }
  } else if (v.qualificationRequired === "diploma") {
    if (DIPLOMA_OR_ABOVE.includes(c.qualification) || c.vicDiplomaLevel) {
      qualPoints = 35;
      reasons.push("Diploma or higher");
    } else if (c.studying) {
      qualPoints = 12;
      reasons.push("Studying — not yet diploma-qualified");
    } else gate ??= "This ad needs a diploma";
  } else if (v.qualificationRequired === "cert_iii") {
    if (CERT_III_OR_ABOVE.includes(c.qualification) || c.vicDiplomaLevel) {
      qualPoints = 35;
      reasons.push("Certificate III or higher");
    } else if (c.studying) {
      qualPoints = 18;
      reasons.push("Studying towards a qualification");
    } else gate ??= "This ad needs at least a Certificate III";
  } else {
    // No qualification required (e.g. NSW): qualifications still help.
    if (DIPLOMA_OR_ABOVE.includes(c.qualification) || c.vicDiplomaLevel) {
      qualPoints = 35;
      reasons.push("Diploma or degree");
    } else if (c.qualification === "cert_iii") {
      qualPoints = 28;
      reasons.push("Certificate III");
    } else if (c.studying) {
      qualPoints = 20;
      reasons.push("Studying");
    } else {
      qualPoints = 12;
      reasons.push("No qualification (fine for this role)");
    }
  }
  score += qualPoints;

  // ── Availability (20) ──
  if (v.holiday) {
    const w = c.holidayWeeks;
    if (w != null) {
      const pts = w >= 4 ? 20 : w >= 2 ? 13 : w >= 1 ? 6 : 0;
      score += pts;
      reasons.push(w === 0 ? "Can't work the holiday period" : `Available ${w} holiday week${w === 1 ? "" : "s"}`);
    } else if (c.availableSessions.includes("vacation_care")) {
      score += 10;
      reasons.push("Available for vacation care");
    }
  } else {
    const d = c.availableDays.length;
    const pts = d >= 4 ? 20 : d >= 2 ? 13 : d === 1 ? 6 : 0;
    score += pts;
    if (d) reasons.push(`Available ${d} day${d === 1 ? "" : "s"} a week`);
  }

  // ── WWCC (15) ──
  if (c.wwccNumber?.trim()) {
    score += 15;
    reasons.push("Has a Working With Children Check");
  } else reasons.push("No WWCC yet — needs one before starting");

  // ── Location (10) ──
  if (v.state && c.state) {
    if (v.state === c.state) score += 10;
    else reasons.push(`Wants to work in ${c.state} (this ad is ${v.state})`);
  } else score += 5;

  // ── Experience (10) ──
  const yrs = c.yearsExperience ?? 0;
  if (yrs >= 2) {
    score += 10;
    reasons.push(`${yrs} years' experience with children`);
  } else if (yrs >= 1) {
    score += 6;
    reasons.push("1 year's experience with children");
  } else if (c.previousRole?.trim()) {
    score += 3;
  }

  // ── First aid (5), transport (5) ──
  if (c.hasFirstAid) {
    score += 5;
    reasons.push("First aid certificate");
  }
  if (c.hasTransport) score += 5;

  score = Math.max(0, Math.min(100, score));
  if (gate) return { score: Math.min(score, 30), label: "not_eligible", reasons: [gate, ...reasons] };
  const label: FitLabel = score >= 75 ? "strong" : score >= 55 ? "good" : "possible";
  return { score, label, reasons };
}

/** Score a stored candidate against their vacancy (shapes straight from Prisma). */
export function fitForRecords(
  vacancy: {
    state: string | null;
    qualificationRequired: string | null;
    title: string | null;
    workPeriod: string | null;
    service?: { state: string | null } | null;
  },
  c: FitCandidate,
): FitResult {
  return scoreCandidate(
    {
      state: vacancy.state ?? vacancy.service?.state ?? null,
      qualificationRequired: vacancy.qualificationRequired,
      holiday: vacancyIsHoliday(vacancy),
    },
    c,
  );
}
