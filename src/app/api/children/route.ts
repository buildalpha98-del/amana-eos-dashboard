import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { primaryParentSchema } from "@/lib/schemas/json-fields";
import { getCentreScope, applyCentreFilter } from "@/lib/centre-scope";

/**
 * Sort keys we accept from clients. Anything else falls back to `createdAt desc`.
 */
const SORT_MAP: Record<string, { field: string; direction: "asc" | "desc" }> = {
  surname: { field: "surname", direction: "asc" },
  firstName: { field: "firstName", direction: "asc" },
  addedAt: { field: "createdAt", direction: "desc" },
  dob: { field: "dob", direction: "asc" },
};

/**
 * Days-of-week keys. Used for `?day=mon|tue|...` filtering. Child has no
 * first-class day column — the session days live inside
 * `bookingPrefs.fortnightPattern` JSON — so this filter is applied in JS
 * after the SQL fetch. See the post-fetch scan below.
 */
const DAY_KEYS = new Set([
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
  "sun",
]);

interface NormalisedParent {
  firstName: string;
  surname: string;
  relationship: string;
  isPrimary: boolean;
  phone?: string;
  email?: string;
}

function toParent(raw: unknown, isPrimary: boolean): NormalisedParent | null {
  if (raw == null) return null;
  // Silently exclude entries that fail schema parsing per the commit spec:
  // don't crash the whole response because one enrolment has bad data.
  const result = primaryParentSchema.safeParse(raw);
  if (!result.success) return null;
  const parsed = result.data;
  const firstName = (parsed.firstName ?? "").trim();
  const surname = (parsed.surname ?? "").trim();
  if (!firstName && !surname) return null;
  return {
    firstName,
    surname,
    relationship: (parsed.relationship ?? "").trim(),
    isPrimary,
    phone: parsed.mobile?.trim() || undefined,
    email: parsed.email?.trim() || undefined,
  };
}

export const GET = withApiAuth(async (req, session) => {
  const url = new URL(req.url);
  const params = url.searchParams;

  // Centre-scope enforcement (added 2026-04-29 — was missing entirely; any
  // authenticated user could fetch every child system-wide). Uses the same
  // helper as the services list, so member/staff/marketing get a single-
  // service filter, coordinators get their assigned + managed services,
  // owner/head_office stay unscoped, admin filters by state below.
  const { serviceIds: scopedServiceIds } = await getCentreScope(session);

  const search = params.get("search") || "";
  const statusParam = params.get("status") || "";
  const serviceId = params.get("serviceId") || "";
  const room = params.get("room") || "";
  const day = (params.get("day") || "").toLowerCase();
  const ccsStatus = params.get("ccsStatus") || "";
  const sortBy = params.get("sortBy") || "";
  const includeParents = params.get("includeParents") === "true";
  const tags = params.getAll("tags").filter(Boolean);
  const limit = Math.min(Number(params.get("limit") || "100"), 200);

  const where: Record<string, unknown> = {};

  // status filter:
  //   "current" → kids currently relevant to the centre (active + pending)
  //                — broadened 2026-04-29 from active-only because
  //                  newly-approved enrolments often sit at "pending" until
  //                  the admin marks the enrolment "processed", which meant
  //                  the Director of Service saw zero children in their
  //                  service's Children tab right after approving an
  //                  enrolment.
  //   "withdrawn" → kids no longer attending
  //   "all"       → no status filter
  //   otherwise   → exact match (e.g., "pending" or "active" alone)
  if (statusParam) {
    if (statusParam === "current") {
      where.status = { in: ["active", "pending"] };
    } else if (statusParam !== "all") {
      where.status = statusParam;
    }
  }

  // Apply centre scope FIRST (security boundary). If the caller also passes
  // ?serviceId= and they're a scoped role, intersect: the filter ID must be
  // in their allowed set, else they see nothing.
  applyCentreFilter(where, scopedServiceIds);
  if (serviceId) {
    if (scopedServiceIds === null) {
      // Unscoped role (owner/head_office/admin) — accept the filter directly.
      where.serviceId = serviceId;
    } else if (scopedServiceIds.includes(serviceId)) {
      // Scoped role asking for a service they're allowed to see — narrow.
      where.serviceId = serviceId;
    } else {
      // Scoped role asking for a service they're NOT allowed to see — return
      // nothing rather than 403, to keep the list page silently filtered.
      where.serviceId = "__no_access__";
    }
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { surname: { contains: search, mode: "insensitive" } },
      { schoolName: { contains: search, mode: "insensitive" } },
    ];
  }

  // Room filter — first-class Child.room column (4b). The old ownaRoomName
  // fallback is intentionally dropped: Commit 3's UI derives room options
  // only from Child.room, so filtering on ownaRoomName would let users
  // pick a value that never matches.
  if (room) {
    where.room = room;
  }

  // CCS status — first-class Child.ccsStatus column (4b).
  if (ccsStatus) {
    where.ccsStatus = ccsStatus;
  }

  // Tags — OR semantic via hasSome. Empty array skipped.
  if (tags.length > 0) {
    where.tags = { hasSome: tags };
  }

  // Day filter is applied after the DB fetch (see below) because
  // bookingPrefs.fortnightPattern is JSON.

  const sortConfig = SORT_MAP[sortBy];
  const orderBy = sortConfig
    ? { [sortConfig.field]: sortConfig.direction }
    : { createdAt: "desc" as const };

  const [children, total] = await Promise.all([
    prisma.child.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
        enrolment: {
          select: {
            id: true,
            primaryParent: true,
            secondaryParent: true,
            status: true,
            createdAt: true,
          },
        },
      },
      orderBy,
      take: limit,
    }),
    prisma.child.count({ where }),
  ]);

  // Day filter — applied after SQL fetch because fortnightPattern is JSON.
  // Acceptable at <2000 children per service. When applied, `total` reflects
  // the filtered result (not the DB count) so pagination stays honest.
  let dayFiltered = children;
  const dayFilterApplied = Boolean(day && DAY_KEYS.has(day));
  if (dayFilterApplied) {
    dayFiltered = children.filter((c) => {
      const prefs = (c as unknown as { bookingPrefs?: unknown }).bookingPrefs as
        | { fortnightPattern?: { week1?: Record<string, string[]>; week2?: Record<string, string[]> } }
        | null
        | undefined;
      const fp = prefs?.fortnightPattern;
      if (!fp) return false;
      const weeks = [fp.week1, fp.week2].filter(Boolean) as Record<string, string[]>[];
      return weeks.some((week) =>
        Object.values(week).some(
          (days) => Array.isArray(days) && days.includes(day),
        ),
      );
    });
  }

  // If the caller asked for hydrated parents, normalise them from the JSON
  // fields on the enrolment. Otherwise keep the existing response shape.
  const hydrated = includeParents
    ? dayFiltered.map((child) => {
        const enrolment = (child as unknown as { enrolment?: { primaryParent?: unknown; secondaryParent?: unknown } }).enrolment;
        const parents: NormalisedParent[] = [];
        const primary = toParent(enrolment?.primaryParent, true);
        if (primary) parents.push(primary);
        const secondary = toParent(enrolment?.secondaryParent, false);
        if (secondary) parents.push(secondary);
        return { ...child, parents };
      })
    : dayFiltered;

  return NextResponse.json({
    children: hydrated,
    total: dayFilterApplied ? dayFiltered.length : total,
  });
});
