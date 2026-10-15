/**
 * Public careers visibility predicate.
 *
 * What MUST be true:
 *   - A website-published vacancy stays public while the role is still being
 *     hired for (open / interviewing / offered) — moving a vacancy to
 *     "interviewing" must NOT 404 the job ad (that is exactly what happened to
 *     the AIA Coburg Coordinator ad on 2026-09-18).
 *   - filled / cancelled / deleted / not-published-to-website are never public.
 *   - Every public surface (list API, list page, detail page, apply route)
 *     builds its where-clause from this ONE helper.
 */
import { describe, it, expect } from "vitest";
import {
  PUBLIC_VACANCY_STATUSES,
  publicVacancyWhere,
} from "@/lib/recruitment/public-vacancy";

describe("PUBLIC_VACANCY_STATUSES", () => {
  it("keeps a role public while it is still being hired for", () => {
    expect(PUBLIC_VACANCY_STATUSES).toEqual(
      expect.arrayContaining(["open", "interviewing", "offered"]),
    );
  });

  it("never exposes filled or cancelled roles", () => {
    expect(PUBLIC_VACANCY_STATUSES).not.toContain("filled");
    expect(PUBLIC_VACANCY_STATUSES).not.toContain("cancelled");
  });
});

describe("publicVacancyWhere", () => {
  it("builds the list predicate: not deleted, still hiring, published to website", () => {
    expect(publicVacancyWhere()).toEqual({
      deleted: false,
      status: { in: [...PUBLIC_VACANCY_STATUSES] },
      postedChannels: { has: "website" },
    });
  });

  it("scopes to a single vacancy when given an id", () => {
    expect(publicVacancyWhere("vac-1")).toEqual({
      id: "vac-1",
      deleted: false,
      status: { in: [...PUBLIC_VACANCY_STATUSES] },
      postedChannels: { has: "website" },
    });
  });
});
