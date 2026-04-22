import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { primaryParentSchema } from "@/lib/schemas/json-fields";

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
 * Days-of-week keys. Used for `?day=mon|tue|...` filtering. The Child model
 * does not yet expose a first-class day field, so filtering by day today is a
 * no-op at the SQL layer (see TODO below). We still accept + echo the query
 * param so the UI doesn't have to special-case it.
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

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const params = url.searchParams;

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

  // status=current (alias for "active"), status=withdrawn, status=all
  if (statusParam) {
    if (statusParam === "current") {
      where.status = "active";
    } else if (statusParam !== "all") {
      where.status = statusParam;
    }
  }

  if (serviceId) {
    where.serviceId = serviceId;
  }

  if (search) {
    where.OR = [
      { firstName: { contains: search, mode: "insensitive" } },
      { surname: { contains: search, mode: "insensitive" } },
      { schoolName: { contains: search, mode: "insensitive" } },
    ];
  }

  // Room filter — Child model has no first-class `room` column today; OWNA
  // provides `ownaRoomName` for some records, so we use that when present.
  // TODO(4b+): add a first-class `room` field or join on a Room model.
  if (room) {
    where.ownaRoomName = room;
  }

  // Day filter — currently a no-op at the DB layer. bookingPrefs is a Json
  // blob so filtering by weekday requires application-level scanning; until a
  // structured booking table exists we accept the param and skip SQL filtering.
  // TODO(4b+): promote fortnightPattern days into a first-class column.
  if (day && DAY_KEYS.has(day)) {
    // intentional no-op — preserves API shape without breaking.
  }

  // CCS status — Child has no `ccsStatus` field yet; accept + ignore.
  // TODO(4b+): add ccsStatus enum to Child when CCS pipeline lands.
  if (ccsStatus) {
    // intentional no-op
  }

  // Tags — Child has no `tags` string[] field yet; accept + ignore.
  // TODO(4b+): add `tags String[]` to Child and switch to `hasSome`.
  if (tags.length > 0) {
    // intentional no-op
  }

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

  // If the caller asked for hydrated parents, normalise them from the JSON
  // fields on the enrolment. Otherwise keep the existing response shape.
  const hydrated = includeParents
    ? children.map((child) => {
        const enrolment = (child as unknown as { enrolment?: { primaryParent?: unknown; secondaryParent?: unknown } }).enrolment;
        const parents: NormalisedParent[] = [];
        const primary = toParent(enrolment?.primaryParent, true);
        if (primary) parents.push(primary);
        const secondary = toParent(enrolment?.secondaryParent, false);
        if (secondary) parents.push(secondary);
        return { ...child, parents };
      })
    : children;

  return NextResponse.json({ children: hydrated, total });
});
