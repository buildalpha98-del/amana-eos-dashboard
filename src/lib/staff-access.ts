/**
 * Who may see a staff member's personal HR record.
 *
 * One rule, one place. Before this existed the same question was answered
 * three different ways — `canAccessProfile` in the /staff/[id] page, an
 * inline same-service check in /api/staff-documents/[id], and *nothing at
 * all* in GET /api/documents (which is how personal HR files ended up
 * listed, and downloadable, for every Educator in the org).
 *
 * The rule, confirmed 2026-09-14:
 *
 *   - the staff member themselves
 *   - org admins — owner / admin / head_office (State Manager)
 *   - a Director of Service (`member`) at any centre that staff member
 *     is attached to
 *
 * and nobody else. An Educator at the same centre is NOT included: sitting
 * next to someone is not a reason to read their contract or their WWCC.
 *
 * ── Centre scope (widened 2026-09-14) ────────────────────────────────
 *
 * Both sides of the comparison count primary `serviceId` AND active
 * `UserServiceMembership` rows, plus (for the Director) centres they
 * manage via `Service.managerId`. The first cut compared primary
 * serviceId only, which got two real cases wrong:
 *
 *   - A Director covering two centres saw staff at their primary one
 *     only, despite the second centre's roster being theirs to run.
 *   - An Educator based at centre A but also rostered at B via a
 *     membership was invisible to B's Director — who has them on shift
 *     and needs to check their WWCC is current.
 *
 * A membership is not incidental: an admin creates it deliberately
 * through the /team "additional services" flow, and the roster already
 * treats it as "this person works here" (`useServiceStaff` reads primary
 * + memberships). Supervision follows the same attachment.
 *
 * The Director's own scope mirrors `getCentreScope`'s `member` branch in
 * @/lib/centre-scope. It is re-derived here rather than shared because
 * that helper reads the session JWT, and this question is asked about a
 * viewer id — a stale token must never widen who can read an HR file.
 */

import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";

/** The non-admin role trusted with their own centres' staff records. */
export const STAFF_RECORD_SUPERVISOR_ROLE = "member";

/**
 * Centres a Director supervises: the one they're based at, any they
 * manage, and any they've been attached to. Mirrors `getCentreScope`'s
 * member branch.
 */
async function directorCentreScope(viewerId: string): Promise<Set<string>> {
  const [viewer, managed, memberships] = await Promise.all([
    prisma.user.findUnique({
      where: { id: viewerId },
      select: { serviceId: true },
    }),
    prisma.service.findMany({
      where: { managerId: viewerId },
      select: { id: true },
    }),
    prisma.userServiceMembership.findMany({
      where: { userId: viewerId, status: "active" },
      select: { serviceId: true },
    }),
  ]);

  const ids = new Set<string>();
  if (viewer?.serviceId) ids.add(viewer.serviceId);
  for (const s of managed) ids.add(s.id);
  for (const m of memberships) ids.add(m.serviceId);
  return ids;
}

/** Centres a staff member is attached to: primary plus active memberships. */
async function staffCentreAttachments(target: {
  id: string;
  serviceId: string | null;
}): Promise<Set<string>> {
  const memberships = await prisma.userServiceMembership.findMany({
    where: { userId: target.id, status: "active" },
    select: { serviceId: true },
  });

  const ids = new Set<string>();
  if (target.serviceId) ids.add(target.serviceId);
  for (const m of memberships) ids.add(m.serviceId);
  return ids;
}

export async function canAccessStaffProfile(
  viewerId: string,
  viewerRole: string | null,
  target: { id: string; serviceId: string | null },
): Promise<boolean> {
  if (viewerId === target.id) return true;
  if (isAdminRole(viewerRole)) return true;
  if (viewerRole !== STAFF_RECORD_SUPERVISOR_ROLE) return false;

  const [viewerCentres, targetCentres] = await Promise.all([
    directorCentreScope(viewerId),
    staffCentreAttachments(target),
  ]);

  // Empty on either side matches nobody. Guards the case where a Director
  // with no centre and a staff member with no centre would otherwise pass
  // a naive null === null comparison.
  if (viewerCentres.size === 0 || targetCentres.size === 0) return false;

  for (const id of targetCentres) {
    if (viewerCentres.has(id)) return true;
  }
  return false;
}

/**
 * Can this viewer open a Document that belongs to a staff member?
 *
 * `assignedToId` is what makes a Document personal — it names the staff
 * member the document is *about*. A document with no assignee is an
 * org/centre resource and is not this function's business; it returns
 * false so callers fall back to their own (centre-scoped) rules.
 */
export async function canViewStaffDocument(
  viewerId: string,
  viewerRole: string | null,
  doc: { uploadedById: string | null; assignedToId: string | null },
): Promise<boolean> {
  if (doc.assignedToId && doc.assignedToId === viewerId) return true;
  if (doc.uploadedById && doc.uploadedById === viewerId) return true;
  if (isAdminRole(viewerRole)) return true;
  if (!doc.assignedToId) return false;

  const assignee = await prisma.user.findUnique({
    where: { id: doc.assignedToId },
    select: { id: true, serviceId: true },
  });
  if (!assignee) return false;

  return canAccessStaffProfile(viewerId, viewerRole, assignee);
}
