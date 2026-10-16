/**
 * One definition of "a job ad the public can see and apply to" (2026-10-16):
 * not deleted, open, published to the website, and not past its closing
 * date (an ad closes at the END of its closing day, Sydney time). Used by the
 * careers list, the job page, the public JSON API, the Jora feed and the
 * apply route — so an ad can't be visible in one and closed in another.
 */
import type { Prisma } from "@prisma/client";
import { serviceDateOnly } from "@/lib/timezone";

export function publicVacancyWhere(now = new Date()): Prisma.RecruitmentVacancyWhereInput {
  return {
    deleted: false,
    status: "open",
    postedChannels: { has: "website" },
    // closesAt is stored as the closing DATE (UTC midnight); still open today.
    OR: [{ closesAt: null }, { closesAt: { gte: serviceDateOnly(now) } }],
  };
}

export const PUBLIC_ROLE_LABELS: Record<string, string> = {
  educator: "Educator",
  senior_educator: "Senior Educator",
  member: "Coordinator",
  director: "Director",
};

export function vacancyHeadline(v: { title: string | null; role: string }): string {
  return v.title?.trim() || PUBLIC_ROLE_LABELS[v.role] || v.role.replace(/_/g, " ");
}

export function vacancyState(v: { state: string | null; service?: { state: string | null } | null }): string | null {
  return v.state ?? v.service?.state ?? null;
}

/** "Applications close Fri 20 Nov" */
export function closingLabel(closesAt: Date | null): string | null {
  if (!closesAt) return null;
  return `Applications close ${closesAt.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" })}`;
}
