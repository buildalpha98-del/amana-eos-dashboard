/**
 * Per-person access on top of the role (2026-10-08), after OWNA's staff
 * "Access & Permissions" tab.
 *
 * Roles still decide almost everything. These ticks exist for the cases a
 * role can't express — one trusted senior educator who may release posts,
 * or share an incident report with a family — and each one changes what
 * the SERVER does. A tick that only hid a button would be decoration, and
 * a settings screen of decoration teaches people to trust none of it.
 */

export const STAFF_PERMISSIONS = [
  {
    key: "posts.publish",
    label: "Can approve and publish posts",
    help: "Their posts go straight to families, and they can release other educators' drafts. A Director can also publish while “only admins publish” is on.",
  },
  {
    key: "incidents.share",
    label: "Can send incident reports to families",
    help: "Normally the Coordinator's job. Tick for a senior educator who closes out incidents on shift.",
  },
] as const;

export type StaffPermission = (typeof STAFF_PERMISSIONS)[number]["key"];
export const STAFF_PERMISSION_KEYS: readonly string[] = STAFF_PERMISSIONS.map((p) => p.key);

/**
 * Registered positions, as the regulator and OWNA name them. Several per
 * person. `responsible_person` marks who may be the designated Responsible
 * Person — the RP register lists them first.
 */
export const STAFF_POSITIONS = [
  { key: "nominated_supervisor", label: "Nominated Supervisor" },
  { key: "responsible_person", label: "Responsible Person" },
  { key: "educational_leader", label: "Educational Leader" },
  { key: "coordinator", label: "Coordinator" },
  { key: "assistant_coordinator", label: "Assistant Coordinator" },
  { key: "room_leader", label: "Room Leader" },
  { key: "educator", label: "Educator" },
  { key: "casual_educator", label: "Casual Educator" },
  { key: "first_aid_officer", label: "First Aid Officer" },
  { key: "food_safety_supervisor", label: "Food Safety Supervisor" },
  { key: "administration", label: "Administration" },
  { key: "trainee", label: "Trainee" },
  { key: "student", label: "Student" },
  { key: "volunteer", label: "Volunteer" },
] as const;

export const STAFF_POSITION_KEYS: readonly string[] = STAFF_POSITIONS.map((p) => p.key);

export function positionLabel(key: string): string {
  return STAFF_POSITIONS.find((p) => p.key === key)?.label ?? key;
}

/** True when the person carries the tick. Unknown/legacy values never grant. */
export function hasStaffPermission(
  permissions: readonly string[] | null | undefined,
  key: StaffPermission,
): boolean {
  return Array.isArray(permissions) && permissions.includes(key);
}
