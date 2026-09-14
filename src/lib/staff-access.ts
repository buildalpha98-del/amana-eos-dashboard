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
 *   - the Director of Service (`member`) at the centre that staff member
 *     is based at
 *
 * and nobody else. An Educator at the same centre is NOT included: sitting
 * next to someone is not a reason to read their contract or their WWCC.
 *
 * Service scope here is the staff member's PRIMARY `serviceId` only, not
 * their additional `UserServiceMembership` rows. That is deliberate — it
 * keeps "can open the profile" and "can open the profile's documents" the
 * same answer, and widening one without the other is how these two drifted
 * apart in the first place.
 */

import { prisma } from "@/lib/prisma";
import { isAdminRole } from "@/lib/role-permissions";

/** The non-admin role trusted with their own centre's staff records. */
export const STAFF_RECORD_SUPERVISOR_ROLE = "member";

export async function canAccessStaffProfile(
  viewerId: string,
  viewerRole: string | null,
  target: { id: string; serviceId: string | null },
): Promise<boolean> {
  if (viewerId === target.id) return true;
  if (isAdminRole(viewerRole)) return true;

  if (viewerRole === STAFF_RECORD_SUPERVISOR_ROLE) {
    // A Director with no centre of their own matches nobody — guard
    // against the null === null case letting them see unassigned staff.
    if (!target.serviceId) return false;
    const viewer = await prisma.user.findUnique({
      where: { id: viewerId },
      select: { serviceId: true },
    });
    return !!viewer?.serviceId && viewer.serviceId === target.serviceId;
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
