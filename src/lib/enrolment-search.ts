/**
 * Finding an enrolment that isn't on the first page.
 *
 * `/enrolments` fetched a fixed slice — the newest 100 submissions — and then
 * filtered it IN THE BROWSER. Past that many forms the older ones weren't
 * merely off-screen, they were unreachable: no pagination, and a search box
 * that only ever looked at the slice already in hand. Typing a family's name
 * returned "No enrolments match your search", which reads as *the form is
 * gone* rather than *it is further down the list*. Nothing was ever deleted;
 * there was simply no way to ask for it.
 *
 * Parent and child names live inside the `primaryParent` / `children` JSONB
 * columns, so the search has to run as SQL. Prisma's JSON filters can reach
 * `primaryParent->>'email'`, but not into the `children` ARRAY — and staff
 * search by the child's name at least as often as the parent's, because the
 * child is who they were just talking about.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Ceiling on the candidate set, so a one-letter search can't build an
 * unbounded `IN (…)`. Amana is in the low thousands of submissions across
 * every centre, so this is a backstop rather than a limit anyone meets;
 * newest-first ordering means the rows most likely to be wanted survive it.
 */
export const ENROLMENT_SEARCH_CAP = 5000;

/**
 * Escape LIKE metacharacters. Without this a parent surname containing an
 * underscore silently becomes a single-character wildcard, and a stray `%`
 * matches the entire table. Postgres treats backslash as the default LIKE
 * escape, so no explicit ESCAPE clause is needed.
 */
function likePattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/**
 * IDs of submissions matching `term` on a parent or child name, parent email
 * or parent mobile.
 *
 * `serviceId` narrows the scan to one centre. It is an optimisation and a
 * courtesy to the row cap, NOT the authorization boundary — the caller still
 * intersects these IDs with `serviceScopeFilter(session)` in the Prisma
 * query, which is what actually decides who may read a row. Passing the
 * `NO_SERVICE_MATCH` sentinel through is therefore safe and stays fail-closed.
 */
export async function searchEnrolmentIds(
  term: string,
  serviceId?: string,
): Promise<string[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const like = likePattern(trimmed);
  const scope = serviceId
    ? Prisma.sql`AND "serviceId" = ${serviceId}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id FROM "EnrolmentSubmission"
    WHERE (
         ("primaryParent"->>'firstName') ILIKE ${like}
      OR ("primaryParent"->>'surname') ILIKE ${like}
      OR ("primaryParent"->>'email') ILIKE ${like}
      OR ("primaryParent"->>'mobile') ILIKE ${like}
      OR (coalesce("primaryParent"->>'firstName', '') || ' ' ||
          coalesce("primaryParent"->>'surname', '')) ILIKE ${like}
      OR ("secondaryParent"->>'firstName') ILIKE ${like}
      OR ("secondaryParent"->>'surname') ILIKE ${like}
      OR ("secondaryParent"->>'email') ILIKE ${like}
      OR (coalesce("secondaryParent"->>'firstName', '') || ' ' ||
          coalesce("secondaryParent"->>'surname', '')) ILIKE ${like}
      -- The children column is normally an array, but a malformed record
      -- must not take the whole search down with a "cannot extract elements
      -- from an object" error, so its type is checked before expanding it.
      OR (jsonb_typeof("children") = 'array' AND EXISTS (
            SELECT 1 FROM jsonb_array_elements("children") AS c
            WHERE (c->>'firstName') ILIKE ${like}
               OR (c->>'surname') ILIKE ${like}
               OR (coalesce(c->>'firstName', '') || ' ' ||
                   coalesce(c->>'surname', '')) ILIKE ${like}
          ))
    )
    ${scope}
    ORDER BY "createdAt" DESC
    LIMIT ${ENROLMENT_SEARCH_CAP}
  `;

  return rows.map((r) => r.id);
}
