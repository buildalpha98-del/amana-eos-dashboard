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
 * - **State Manager** (`head_office`) whose `User.state` matches
 *   `Scorecard.state` can view but NOT manage (2026-10-07).
 * - Everyone else: no access.
 *
 * "Manage" = rename, delete, invite/remove members, edit any measurable.
 * "View" = list the scorecard, see its measurables + entries.
 * "Enter values" (2026-10-27, Daniel) = type the weekly number into any
 * measurable on a scorecard you've been added to — see
 * `canEnterScorecardValues`.
 *
 * Future tightening (not in Stage 1): scorecard.role-based bulk grants
 * (e.g. "give all admins automatic membership of leadership scorecards")
 * would slot in here as an extra condition.
 */

export interface ViewerRef {
  id: string;
  role: string | null | undefined;
  /** User.state — the state a State Manager (head_office) looks after. */
  state?: string | null;
}

export interface ScorecardRef {
  ownerId: string;
  /** Scorecard.state — set on a state's scorecard (e.g. "NSW"). */
  state?: string | null;
}

/**
 * 2026-10-07: a State Manager sees every scorecard for their state without
 * being invited one by one — Mirna (NSW) sees the NSW scorecard, Tracie
 * (VIC) the VIC one. View only: managing stays with the scorecard's owner.
 */
export function isStateManagerFor(viewer: ViewerRef, scorecard: ScorecardRef): boolean {
  return (
    viewer.role === "head_office" &&
    !!viewer.state &&
    !!scorecard.state &&
    viewer.state.trim().toUpperCase() === scorecard.state.trim().toUpperCase()
  );
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
  if (isStateManagerFor(viewer, scorecard)) return true;
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

/**
 * Roles that could always enter weekly values, on any scorecard. Kept as-is
 * so nobody loses access; the participant rule below is ADDED to it.
 */
export const SCORECARD_ENTRY_ROLES = ["owner", "head_office", "admin", "member", "eos_implementer"] as const;

/**
 * Can the viewer type (or clear) a weekly number on this measurable?
 *
 * 2026-10-27 (Daniel): "if a member is added to a scorecard, they should be
 * able to edit the number within it" — the marketing team (Shabaz, Proven)
 * were invited to their activation scorecard and every number they typed
 * was refused, because entry was gated on role alone and `marketing` wasn't
 * in the list. Now: the old roles, OR anyone on that scorecard (owner,
 * invited member, the state's State Manager), OR the measurable's own
 * owner. `eos_viewer` stays read-only even when invited — that role exists
 * to look, not to change numbers.
 */
export function canEnterScorecardValues(
  viewer: ViewerRef,
  scorecard: ScorecardRef,
  memberUserIds: ReadonlySet<string> | readonly string[],
  measurableOwnerId?: string | null,
): boolean {
  if (!viewer.id || viewer.role === "eos_viewer") return false;
  if ((SCORECARD_ENTRY_ROLES as readonly string[]).includes(viewer.role ?? "")) return true;
  if (measurableOwnerId && measurableOwnerId === viewer.id) return true;
  return canViewScorecard(viewer, scorecard, memberUserIds);
}
