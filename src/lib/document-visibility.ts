/**
 * Who may see which Document — ONE rule, used by the Documents library
 * (GET /api/documents) and the AI knowledge search (searchChunks), so the
 * assistant can never quote a file the library would hide.
 *
 * 2026-10-07: a Document with no centre, no "all services" flag and no
 * assignee used to count as org-wide. That is the shape of a loose upload —
 * Akram's contract dropped into the library without being linked to him —
 * and it put the file in every Educator's list. The AI search was worse: it
 * had no filter at all, so any staff member could have the assistant quote
 * any indexed document, personal HR files included.
 *
 * Non-admins now see a document only when it was deliberately published:
 *   - `allServices` (org-wide), or
 *   - scoped to a centre they can see (their own, for centre roles), or
 *   - curated AI knowledge (Settings → AI Knowledge — admin-managed and
 *     meant for everyone), or
 *   - they uploaded it themselves.
 * Personal HR documents (`assignedToId` set) never appear for non-admins —
 * those reach their owner through My Contract / My Compliance / the staff
 * profile, which enforce their own checks.
 */
import type { Prisma } from "@prisma/client";
import { isAdminRole } from "@/lib/role-permissions";

/** How AI Knowledge entries are marked (see /api/settings/ai-knowledge). */
export const AI_KNOWLEDGE_FILE_URL = "internal://knowledge";
export const AI_KNOWLEDGE_URL_SEGMENT = "/ai-knowledge/";

export interface DocumentViewer {
  id: string;
  role: string;
  serviceId?: string | null;
}

const CENTRE_SCOPED_ROLES = new Set(["staff", "member"]);

export function canSeeAllDocuments(viewer: DocumentViewer): boolean {
  return isAdminRole(viewer.role);
}

/** Prisma where-fragment: the documents `viewer` may see. */
export function documentVisibilityWhere(
  viewer: DocumentViewer,
): Prisma.DocumentWhereInput {
  if (canSeeAllDocuments(viewer)) return {};

  const centreBranch: Prisma.DocumentWhereInput[] = CENTRE_SCOPED_ROLES.has(viewer.role)
    ? viewer.serviceId
      ? [{ centreId: viewer.serviceId }]
      : []
    : // Office roles that aren't admins (marketing, EOS) aren't centre-bound.
      [{ centreId: { not: null } }];

  return {
    assignedToId: null,
    OR: [
      { allServices: true },
      ...centreBranch,
      { fileUrl: AI_KNOWLEDGE_FILE_URL },
      { fileUrl: { contains: AI_KNOWLEDGE_URL_SEGMENT } },
      { uploadedById: viewer.id },
    ],
  };
}

/**
 * The same rule as SQL for the raw full-text search, against a `Document`
 * aliased `d`. Returns the clause plus its parameters, numbered from
 * `firstParam` so callers can append to their own parameter list.
 */
export function documentVisibilitySql(
  viewer: DocumentViewer,
  firstParam: number,
): { sql: string; params: unknown[] } {
  if (canSeeAllDocuments(viewer)) return { sql: "TRUE", params: [] };

  const p = (i: number) => `$${firstParam + i}`;
  const params: unknown[] = [AI_KNOWLEDGE_FILE_URL, `%${AI_KNOWLEDGE_URL_SEGMENT}%`, viewer.id];
  let centre: string;
  if (CENTRE_SCOPED_ROLES.has(viewer.role)) {
    if (viewer.serviceId) {
      params.push(viewer.serviceId);
      centre = `d."centreId" = ${p(3)}`;
    } else {
      centre = "FALSE";
    }
  } else {
    centre = `d."centreId" IS NOT NULL`;
  }

  return {
    sql: `(d."assignedToId" IS NULL AND (
      d."allServices" = TRUE
      OR ${centre}
      OR d."fileUrl" = ${p(0)}
      OR d."fileUrl" LIKE ${p(1)}
      OR d."uploadedById" = ${p(2)}
    ))`,
    params,
  };
}
