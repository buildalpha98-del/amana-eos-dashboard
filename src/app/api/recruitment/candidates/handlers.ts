/**
 * The casual staff pool — list and manual intake.
 *
 * 2026-09-15. Candidates were previously only reachable through the vacancy
 * they applied to (`/api/recruitment/[id]/candidates`), so there was no way to
 * ask "who do we have?" across the whole funnel. This route is that view.
 *
 * The filters exist because of how the pool is actually used: a centre needs
 * someone for Tuesday afternoon, near a suburb, cleared to start. Filtering in
 * the database rather than the browser matters — the pool is meant to grow into
 * the hundreds.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { parsePagination } from "@/lib/pagination";
import {
  POOL_STAGES,
  POOL_SESSIONS,
  POOL_DAYS,
  POOL_SOURCES,
  RIGHT_TO_WORK,
  ACTIVE_POOL_STAGES,
} from "@/lib/recruitment/pool";

export const candidateInclude = {
  vacancy: {
    select: {
      id: true,
      role: true,
      region: true,
      service: { select: { id: true, name: true } },
    },
  },
  _count: { select: { candidateNotes: true } },
} as const;

const listQuerySchema = z.object({
  q: z.string().optional(),
  stage: z.string().optional(),
  session: z.enum(POOL_SESSIONS).optional(),
  day: z.enum(POOL_DAYS).optional(),
  region: z.string().optional(),
  source: z.string().optional(),
  /** "active" (default) hides hired/unsuitable/withdrawn; "all" shows everything. */
  scope: z.enum(["active", "all", "archived"]).optional(),
  sort: z.enum(["recent", "name", "rating", "stale"]).optional(),
});

export const GET = withApiAuth(async (req) => {
  const { searchParams } = new URL(req.url);
  const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid query", parsed.error.flatten());
  }
  const p = parsed.data;
  const scope = p.scope ?? "active";

  const and: Prisma.RecruitmentCandidateWhereInput[] = [];

  // Archived is an explicit view, never mixed into the working list.
  and.push(scope === "archived" ? { archivedAt: { not: null } } : { archivedAt: null });

  if (p.stage) {
    and.push({ stage: p.stage });
  } else if (scope === "active") {
    and.push({ stage: { in: [...ACTIVE_POOL_STAGES] } });
  }

  if (p.q?.trim()) {
    const q = p.q.trim();
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { suburb: { contains: q, mode: "insensitive" } },
        { postcode: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (p.session) and.push({ availableSessions: { has: p.session } });
  if (p.day) and.push({ availableDays: { has: p.day } });
  if (p.region) and.push({ preferredRegion: { equals: p.region, mode: "insensitive" } });
  if (p.source) and.push({ source: p.source });

  const where: Prisma.RecruitmentCandidateWhereInput = { AND: and };

  const orderBy: Prisma.RecruitmentCandidateOrderByWithRelationInput[] =
    p.sort === "name"
      ? [{ name: "asc" }]
      : p.sort === "rating"
        ? [{ rating: "desc" }, { appliedAt: "desc" }]
        : p.sort === "stale"
          ? // Nulls first: never-contacted is the most stale thing there is.
            [{ lastContactedAt: { sort: "asc", nulls: "first" } }]
          : [{ appliedAt: "desc" }];

  const pagination = parsePagination(searchParams);
  const [items, total] = await Promise.all([
    prisma.recruitmentCandidate.findMany({
      where,
      include: candidateInclude,
      orderBy,
      ...(pagination ? { skip: pagination.skip, take: pagination.limit } : {}),
    }),
    prisma.recruitmentCandidate.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    ...(pagination
      ? { page: pagination.page, totalPages: Math.ceil(total / pagination.limit) }
      : {}),
  });
}, { feature: "recruitment.view" });

const createCandidateSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email().max(200).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
  suburb: z.string().max(120).nullable().optional(),
  postcode: z.string().max(10).nullable().optional(),
  preferredRegion: z.string().max(120).nullable().optional(),
  source: z.enum(POOL_SOURCES).default("other"),
  stage: z.enum(POOL_STAGES).default("applied"),
  vacancyId: z.string().nullable().optional(),
  qualification: z
    .enum(["cert_iii", "diploma", "bachelor", "masters", "other"])
    .nullable()
    .optional(),
  studying: z.boolean().optional(),
  wwccNumber: z.string().max(60).nullable().optional(),
  wwccExpiry: z.coerce.date().nullable().optional(),
  hasFirstAid: z.boolean().optional(),
  rightToWork: z.enum(RIGHT_TO_WORK).nullable().optional(),
  previousRole: z.string().max(200).nullable().optional(),
  previousEmployer: z.string().max(200).nullable().optional(),
  yearsExperience: z.number().int().min(0).max(60).nullable().optional(),
  availableSessions: z.array(z.enum(POOL_SESSIONS)).optional(),
  availableDays: z.array(z.enum(POOL_DAYS)).optional(),
  earliestStart: z.coerce.date().nullable().optional(),
  hasTransport: z.boolean().optional(),
  rating: z.number().int().min(1).max(5).nullable().optional(),
  resumeFileUrl: z.string().url().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

/**
 * Manual intake — a walk-in, a referral, or someone who applied on Indeed
 * (which has no API we can pull from, so re-keying is the honest answer).
 */
export const POST = withApiAuth(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = createCandidateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Validation failed", parsed.error.flatten().fieldErrors);
  }
  const d = parsed.data;

  const candidate = await prisma.recruitmentCandidate.create({
    data: {
      ...d,
      email: d.email ?? null,
      availableSessions: d.availableSessions ?? [],
      availableDays: d.availableDays ?? [],
      vacancyId: d.vacancyId ?? null,
    },
    include: candidateInclude,
  });

  return NextResponse.json(candidate, { status: 201 });
}, { feature: "recruitment.candidates.manage" });
