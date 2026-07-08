/**
 * GET /api/public/careers — public list of open vacancies published to the website.
 *
 * INTENTIONALLY UNAUTHENTICATED. This returns only the roles a recruiter has
 * explicitly flagged for the public careers page (`postedChannels` contains
 * "website") and only while they're still open. It exposes job-ad fields only —
 * never candidate data, internal notes beyond the drafted ad, assignees, or PDs.
 *
 * Consumed by the marketing site (amanaoshc.com.au/careers) and the
 * dashboard-hosted public careers index at /careers.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiHandler } from "@/lib/api-handler";

// Human-facing labels for the enum-ish stored values.
const ROLE_LABELS: Record<string, string> = {
  educator: "Educator",
  senior_educator: "Senior Educator",
  member: "Coordinator",
  director: "Director",
};
const EMPLOYMENT_LABELS: Record<string, string> = {
  casual: "Casual",
  part_time: "Part-time",
  permanent: "Permanent",
  fixed_term: "Fixed-term",
};
const QUALIFICATION_LABELS: Record<string, string> = {
  cert_iii: "Certificate III",
  diploma: "Diploma",
};

export const GET = withApiHandler(async () => {
  const vacancies = await prisma.recruitmentVacancy.findMany({
    where: {
      deleted: false,
      status: "open",
      postedChannels: { has: "website" },
    },
    include: {
      service: { select: { name: true, suburb: true, state: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const openings = vacancies.map((v) => ({
    id: v.id,
    role: v.role,
    roleLabel: ROLE_LABELS[v.role] ?? v.role.replace(/_/g, " "),
    employmentType: v.employmentType,
    employmentLabel: EMPLOYMENT_LABELS[v.employmentType] ?? v.employmentType,
    qualification: v.qualificationRequired
      ? QUALIFICATION_LABELS[v.qualificationRequired] ?? v.qualificationRequired
      : null,
    centre: v.service?.name ?? "Amana OSHC",
    location: [v.service?.suburb, v.service?.state].filter(Boolean).join(", ") || null,
    // The AI-drafted job ad lives in `notes`; expose it as the public description.
    description: v.notes?.trim() || null,
    postedAt: (v.postedAt ?? v.createdAt).toISOString(),
  }));

  const res = NextResponse.json({ openings });
  // Cache at the edge for a minute — job lists don't change second-to-second,
  // and this shields the DB from marketing-site traffic spikes.
  res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=300");
  return res;
});
