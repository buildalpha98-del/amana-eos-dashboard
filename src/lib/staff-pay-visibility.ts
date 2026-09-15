/**
 * Who may see a staff member's pay and leave data on their profile.
 *
 * 2026-09-15. State Managers (`head_office`) are leadership: they see every
 * staff member in the organisation (see the head_office bypass in
 * `/api/employees`). What they do NOT see is a colleague's remuneration —
 * salary history, contracted work hours, leave balances, or the payroll
 * mapping. Per Jayden: "They will only be limited to not viewing their staff
 * members' payroll, leave balances, all that stuff."
 *
 * Contracts are deliberately NOT gated here. They live in the Documents
 * section, and State Managers are meant to read them — a contract states the
 * pay rate, which was raised and accepted. The line drawn is the Pay &
 * compensation SECTION, not every byte that mentions money.
 *
 * Everyone can always see their own pay, whatever their role.
 */

import { isAdminRole } from "@/lib/role-permissions";

/** Roles that administer the org but must not read a colleague's pay. */
const PAY_BLIND_ADMIN_ROLES: ReadonlySet<string> = new Set(["head_office"]);

/**
 * True when this viewer may see the target's pay, contracted hours, leave
 * balances and payroll link.
 *
 * @param viewerRole the viewer's role
 * @param isSelf     the viewer is looking at their own profile
 */
export function canViewStaffPay(
  viewerRole: string | null | undefined,
  isSelf: boolean,
): boolean {
  if (isSelf) return true;
  if (!viewerRole) return false;
  if (PAY_BLIND_ADMIN_ROLES.has(viewerRole)) return false;
  return isAdminRole(viewerRole);
}
