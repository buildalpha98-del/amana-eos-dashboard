import type { Prisma } from "@prisma/client";

/**
 * Which vacancies are visible on the PUBLIC careers surfaces — the marketing
 * site (amanaoshc.com.au/careers, via GET /api/public/careers), the
 * dashboard-hosted /careers index and /careers/[id] apply page, and the
 * POST …/apply intake.
 *
 * Rule: a role that the recruiter has published to the website
 * (`postedChannels` has "website") stays live until it is FILLED or CANCELLED.
 * Moving it through the pipeline ("interviewing", "offered") must not pull the
 * ad — hiring keeps taking applications while candidates are interviewed, and
 * offers get declined.
 *
 * Why this exists: on 2026-09-18 the AIA Coburg Coordinator vacancy was moved
 * to "interviewing" and every public path 404'd (they all filtered on
 * `status: "open"`), while the marketing site kept showing the card from its
 * ISR cache. Build EVERY public where-clause from this helper so the four
 * surfaces can't drift apart again.
 */
export const PUBLIC_VACANCY_STATUSES = ["open", "interviewing", "offered"] as const;

export type PublicVacancyStatus = (typeof PUBLIC_VACANCY_STATUSES)[number];

/** Prisma `where` for publicly visible vacancies, optionally scoped to one id. */
export function publicVacancyWhere(id?: string): Prisma.RecruitmentVacancyWhereInput {
  return {
    ...(id ? { id } : {}),
    deleted: false,
    status: { in: [...PUBLIC_VACANCY_STATUSES] },
    postedChannels: { has: "website" },
  };
}
