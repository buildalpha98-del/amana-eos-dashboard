/**
 * Pure permission helpers for scorecards. No DB access — the caller
 * loads `Scorecard.ownerId` + the member-ids it already needs for
 * the page and passes them in. Keeps the policy in one place, makes
 * it trivially unit-testable, and lets the API + UI share the exact
 * same checks.
 *
 * Rules (Bucket O Stage 1, design doc 2026-05-12):
 *
 * - **Dashboard owner** (`User.role === "owner"`) is a super-admin —
 *   sees every scorecard, can manage any.
 * - **Scorecard owner** (the user whose id matches `scorecard.ownerId`)
 *   sees + manages the scorecards they created.
 * - **Scorecard member** (present in `ScorecardMember` for that
 *   scorecard) can view but NOT manage.
 * - Everyone else: no access.
 *
 * "Manage" = rename, delete, invite/remove members, edit any measurable.
 * "View" = list the scorecard, see its measurables + entries, enter
 * new values for measurables they personally own.
 *
 * Future tightening (not in Stage 1): scorecard.role-based bulk grants
 * (e.g. "give all admins automatic membership of leadership scorecards")
 * would slot in here as an extra condition.
 */

export interface ViewerRef {
  id: string;
  role: string | null | undefined;
}

export interface ScorecardRef {
  ownerId: string;
}

/**
 * Can the viewer see this scorecard? True when:
 *   - viewer is the dashboard owner, OR
 *   - viewer is the scorecard's owner, OR
 *   - viewer is in the `memberUserIds` set
 */
export function canViewScorecard(
  viewer: ViewerRef,
  scorecard: ScorecardRef,
  memberUserIds: ReadonlySet<string> | readonly string[],
): boolean {
  if (viewer.role === "owner") return true;
  if (viewer.id === scorecard.ownerId) return true;
  const set =
    memberUserIds instanceof Set
      ? memberUserIds
      : new Set(memberUserIds as readonly string[]);
  return set.has(viewer.id);
}

/**
 * Can the viewer rename, delete, or manage members of this scorecard?
 * True when viewer is the dashboard owner OR the scorecard's per-card
 * owner. Members alone do NOT get manage rights.
 */
export function canManageScorecard(
  viewer: ViewerRef,
  scorecard: ScorecardRef,
): boolean {
  if (viewer.role === "owner") return true;
  return viewer.id === scorecard.ownerId;
}

/**
 * Predicate for whether a user is eligible to be assigned as a
 * Measurable's owner within a scorecard — they must be either the
 * scorecard's owner or a member. Used by the create-measurable
 * endpoint to reject "tried to set measurable owner to someone
 * who isn't in this scorecard".
 */
export function isScorecardParticipant(
  userId: string,
  scorecard: ScorecardRef,
  memberUserIds: ReadonlySet<string> | readonly string[],
): boolean {
  if (userId === scorecard.ownerId) return true;
  const set =
    memberUserIds instanceof Set
      ? memberUserIds
      : new Set(memberUserIds as readonly string[]);
  return set.has(userId);
}
