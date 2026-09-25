/**
 * Indeed posting helper — turns a vacancy into something you can paste into
 * Indeed's posting form in about a minute, and into a tracked apply link that
 * brings the applicant back to us.
 *
 * WHY THIS IS COPY-PASTE AND NOT AN API CALL
 * -----------------------------------------
 * Indeed has no self-serve API. Posting programmatically needs their Job Sync
 * API, which is restricted to approved ATS partners under a signed developer
 * agreement; Indeed Apply (applicants land back in our system automatically)
 * is the same programme. The free XML feed that used to cover this closed
 * under Indeed's Single-Source Feed Policy on 31 March 2026, and the old
 * Publisher API was retired in 2023.
 *
 * So the ad goes up by hand. What we CAN control is the apply link: point
 * Indeed's "apply on company website" URL at our own careers page with
 * `?src=indeed`, and every applicant arrives in the pool already attributed,
 * with their availability, WWCC and right-to-work captured — rather than as a
 * PDF someone re-keys a week later.
 *
 * If Amana is ever accepted into Indeed's partner programme, the apply URL
 * below is the only piece that changes.
 */
import { EMPLOYMENT_LABELS } from "./job-ad-templates";
import type { PoolSource } from "./pool";

/**
 * Titles written for how people actually SEARCH on Indeed, which is not how we
 * talk internally. Nobody outside the sector types "OSHC"; they type "before
 * and after school care". The internal ROLE_TITLES stay as they are for the
 * dashboard and the website ad.
 */
const INDEED_ROLE_TITLES: Record<string, string> = {
  educator: "Before & After School Care Educator (OSHC)",
  senior_educator: "Senior Educator — Before & After School Care (OSHC)",
  member: "OSHC Coordinator — Before & After School Care",
  director: "Service Director — Out of School Hours Care",
};

export const COMPANY_NAME = "Amana OSHC";

export interface IndeedAdVacancy {
  id: string;
  role: string;
  employmentType: string;
  region?: string | null;
  notes?: string | null;
  status?: string | null;
  postedChannels?: string[] | null;
  service?: {
    name?: string | null;
    suburb?: string | null;
    state?: string | null;
  } | null;
}

export interface IndeedAd {
  /** Indeed's "Job title" field. */
  title: string;
  /** Indeed's "Company" field. */
  company: string;
  /** Indeed's "Location" field. */
  location: string;
  /** Indeed's "Job type" field. */
  jobType: string;
  /** Indeed's "Description" field — this is the vacancy's Notes verbatim. */
  description: string;
  /** Paste into "Apply on company website". */
  applyUrl: string;
  /**
   * `[BRACKETED]` blanks still sitting in the description. The New Vacancy
   * template ships several on purpose (pay rate, hours, start date), and a
   * live ad reading "Pay: [PAY RATE — e.g. $30–$35 per hour]" is worse than
   * no ad at all.
   */
  placeholders: string[];
  /** Reasons the apply link would not work if the ad went up right now. */
  blockers: string[];
}

/**
 * The link that goes in Indeed's apply field.
 *
 * `src` is what the public intake reads to attribute the candidate — see
 * `normalisePublicSource`, which whitelists it. Keep this the single place the
 * URL is built so the dashboard can never show a link shaped differently from
 * the one the forms understand.
 */
export function trackedApplyUrl(
  origin: string,
  vacancyId: string,
  source: PoolSource = "indeed",
): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/careers/${vacancyId}?src=${source}`;
}

/** The pool's general front door, for ads not tied to one vacancy. */
export function trackedRegisterUrl(
  origin: string,
  source: PoolSource = "indeed",
): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/careers/register?src=${source}`;
}

/** Every `[LIKE THIS]` blank left in the ad copy, de-duplicated, in order. */
export function findPlaceholders(text: string | null | undefined): string[] {
  if (!text) return [];
  const found = text.match(/\[[^\]\n]+\]/g) ?? [];
  return Array.from(new Set(found));
}

function locationFor(v: IndeedAdVacancy): string {
  const suburb = v.service?.suburb?.trim();
  const state = v.service?.state?.trim();
  if (suburb) return [suburb, state].filter(Boolean).join(", ");
  // A site-specific ad with no suburb recorded still has a centre name, which
  // Indeed can geocode well enough ("Amana OSHC MFIS Greenacre").
  const name = v.service?.name?.trim();
  if (name) return name;
  // Regional casual-pool ads have no centre at all — the catchment IS the
  // location, and this is the common case for pool advertising.
  return v.region?.trim() ?? "";
}

export function buildIndeedAd(
  vacancy: IndeedAdVacancy,
  origin: string,
): IndeedAd {
  const description = vacancy.notes?.trim() ?? "";
  const location = locationFor(vacancy);
  const channels = vacancy.postedChannels ?? [];

  const blockers: string[] = [];
  if (!channels.includes("website")) {
    blockers.push(
      "“Show on public careers page” is off — the apply link will 404 until you turn it on.",
    );
  }
  if (vacancy.status && vacancy.status !== "open") {
    blockers.push(
      `This ad is marked “${vacancy.status}” — the apply page only accepts applications while it is open.`,
    );
  }
  if (!description) {
    blockers.push("There is no ad copy yet — write the Notes first.");
  }
  if (!location) {
    blockers.push("No centre or region set — Indeed needs a location.");
  }

  return {
    title:
      INDEED_ROLE_TITLES[vacancy.role] ??
      `${vacancy.role.replace(/_/g, " ")} — Out of School Hours Care`,
    company: COMPANY_NAME,
    location,
    jobType:
      EMPLOYMENT_LABELS[vacancy.employmentType] ??
      vacancy.employmentType.replace(/_/g, " "),
    description,
    applyUrl: trackedApplyUrl(origin, vacancy.id),
    placeholders: findPlaceholders(description),
    blockers,
  };
}

/** The whole ad as one labelled block, for a single "copy everything" button. */
export function formatIndeedAd(ad: IndeedAd): string {
  return [
    `Job title: ${ad.title}`,
    `Company: ${ad.company}`,
    `Location: ${ad.location}`,
    `Job type: ${ad.jobType}`,
    `Apply on company website: ${ad.applyUrl}`,
    "",
    "Description:",
    ad.description,
  ].join("\n");
}
