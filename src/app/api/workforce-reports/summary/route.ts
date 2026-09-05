/**
 * GET /api/workforce-reports/summary — one-shot aggregate feeding the
 * "Workforce" tab of /workforce-reports (Staff Portal v2 Phase 10).
 *
 * Owner / State Manager / Admin only. Returns:
 *   - headcount by role / service / employment type (active users)
 *   - starters & leavers per month, trailing 12 months
 *   - tenure distribution buckets for active users
 *   - essential-track training completion
 *   - cert-expiry outlook (expired / ≤30d / 31–60d / 61–90d)
 *
 * Honesty notes baked into the shape:
 *   - Starters + tenure use `User.startDate` where recorded and fall back
 *     to `User.createdAt` (account creation) where not. `startBasis`
 *     reports the split so the UI can label the fallback. createdAt alone
 *     would be dishonest — bulk-imported staff all share an import date.
 *   - Leavers come from SeparationRecord.lastWorkingDay (the actual
 *     separation date), soft-deleted records excluded.
 *   - Training % counts enrollments in PUBLISHED essential-track courses
 *     for active users only (mirrors the induction gate's definition).
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getCertStatus } from "@/lib/cert-status";
import { getRoleLabel } from "@/lib/org-settings-shared";
import type { Role } from "@prisma/client";

const EMPLOYMENT_TYPE_LABELS: Record<string, string> = {
  casual: "Casual",
  part_time: "Part-time",
  permanent: "Permanent",
  fixed_term: "Fixed-term",
  unspecified: "Not recorded",
};

// NOT exported — Next.js route files may only export HTTP handlers/config.
const TENURE_BUCKETS = [
  { key: "<6mo", label: "< 6 months", maxMonths: 6 },
  { key: "6-12mo", label: "6–12 months", maxMonths: 12 },
  { key: "1-2y", label: "1–2 years", maxMonths: 24 },
  { key: "2-5y", label: "2–5 years", maxMonths: 60 },
  { key: "5y+", label: "5+ years", maxMonths: Infinity },
] as const;

function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** Whole calendar months between two dates (floor, never negative). */
function wholeMonthsBetween(start: Date, end: Date): number {
  let months =
    (end.getFullYear() - start.getFullYear()) * 12 +
    (end.getMonth() - start.getMonth());
  if (end.getDate() < start.getDate()) months -= 1;
  return Math.max(0, months);
}

export const GET = withApiAuth(
  async () => {
    const now = new Date();
    // Trailing 12 months, oldest first, including the current month.
    const monthStarts: Date[] = [];
    for (let i = 11; i >= 0; i--) {
      monthStarts.push(new Date(now.getFullYear(), now.getMonth() - i, 1));
    }
    const months = monthStarts.map(monthKey);
    const windowStart = monthStarts[0];

    const [users, services, separations, essentialEnrollments, certs] =
      await Promise.all([
        prisma.user.findMany({
          where: { active: true },
          select: {
            role: true,
            serviceId: true,
            employmentType: true,
            startDate: true,
            createdAt: true,
          },
        }),
        prisma.service.findMany({ select: { id: true, name: true } }),
        prisma.separationRecord.findMany({
          where: { deleted: false, lastWorkingDay: { gte: windowStart } },
          select: { lastWorkingDay: true },
        }),
        prisma.lMSEnrollment.findMany({
          where: {
            user: { active: true },
            course: { track: "essential", status: "published", deleted: false },
          },
          select: { status: true },
        }),
        prisma.complianceCertificate.findMany({
          where: {
            userId: { not: null },
            user: { active: true },
            supersededAt: null,
            expiryDate: { not: null },
          },
          select: { expiryDate: true },
        }),
      ]);

    // ── Headcounts ──────────────────────────────────────────────
    const byRole = new Map<string, number>();
    const byService = new Map<string, number>();
    const byType = new Map<string, number>();
    for (const u of users) {
      byRole.set(u.role, (byRole.get(u.role) ?? 0) + 1);
      const svcKey = u.serviceId ?? "unassigned";
      byService.set(svcKey, (byService.get(svcKey) ?? 0) + 1);
      const typeKey = u.employmentType ?? "unspecified";
      byType.set(typeKey, (byType.get(typeKey) ?? 0) + 1);
    }

    const serviceName = new Map(services.map((s) => [s.id, s.name]));
    const headcountByRole = [...byRole.entries()]
      .map(([key, count]) => ({
        key,
        label: getRoleLabel(key as Role),
        count,
      }))
      .sort((a, b) => b.count - a.count);
    const headcountByService = [...byService.entries()]
      .map(([key, count]) => ({
        key,
        label: key === "unassigned" ? "Unassigned" : (serviceName.get(key) ?? key),
        count,
      }))
      .sort((a, b) => b.count - a.count);
    const headcountByEmploymentType = [...byType.entries()]
      .map(([key, count]) => ({
        key,
        label: EMPLOYMENT_TYPE_LABELS[key] ?? key,
        count,
      }))
      .sort((a, b) => b.count - a.count);

    // ── Starters & leavers per month ────────────────────────────
    const starterCounts = new Map<string, number>(months.map((m) => [m, 0]));
    const leaverCounts = new Map<string, number>(months.map((m) => [m, 0]));
    let withStartDate = 0;
    let usingCreatedAt = 0;

    for (const u of users) {
      const effectiveStart = u.startDate ?? u.createdAt;
      if (u.startDate) withStartDate++;
      else usingCreatedAt++;
      if (effectiveStart >= windowStart) {
        const key = monthKey(effectiveStart);
        if (starterCounts.has(key)) {
          starterCounts.set(key, (starterCounts.get(key) ?? 0) + 1);
        }
      }
    }
    for (const s of separations) {
      const key = monthKey(s.lastWorkingDay);
      if (leaverCounts.has(key)) {
        leaverCounts.set(key, (leaverCounts.get(key) ?? 0) + 1);
      }
    }

    const startersByMonth = months.map((m) => ({
      month: m,
      count: starterCounts.get(m) ?? 0,
    }));
    const leaversByMonth = months.map((m) => ({
      month: m,
      count: leaverCounts.get(m) ?? 0,
    }));

    // ── Tenure distribution (active users, effective start) ─────
    const tenureCounts = TENURE_BUCKETS.map(() => 0);
    for (const u of users) {
      const tenureMonths = wholeMonthsBetween(u.startDate ?? u.createdAt, now);
      const idx = TENURE_BUCKETS.findIndex((b) => tenureMonths < b.maxMonths);
      tenureCounts[idx === -1 ? TENURE_BUCKETS.length - 1 : idx]++;
    }
    const tenure = TENURE_BUCKETS.map((b, i) => ({
      key: b.key,
      label: b.label,
      count: tenureCounts[i],
    }));

    // ── Training completion (published essential-track courses) ─
    const totalEssential = essentialEnrollments.length;
    const completedEssential = essentialEnrollments.filter(
      (e) => e.status === "completed",
    ).length;
    const completionPct =
      totalEssential > 0
        ? Math.round((completedEssential / totalEssential) * 100)
        : null;

    // ── Cert-expiry outlook (30/60/90 days) ─────────────────────
    const certOutlook = { expired: 0, within30: 0, within60: 0, within90: 0 };
    for (const c of certs) {
      const { daysLeft } = getCertStatus(c.expiryDate, now);
      if (daysLeft === null) continue;
      if (daysLeft < 0) certOutlook.expired++;
      else if (daysLeft <= 30) certOutlook.within30++;
      else if (daysLeft <= 60) certOutlook.within60++;
      else if (daysLeft <= 90) certOutlook.within90++;
    }

    return NextResponse.json({
      activeStaff: users.length,
      headcountByRole,
      headcountByService,
      headcountByEmploymentType,
      months,
      startersByMonth,
      leaversByMonth,
      startBasis: { withStartDate, usingCreatedAt },
      tenure,
      training: { totalEssential, completedEssential, completionPct },
      certOutlook,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
