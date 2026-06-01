import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { PayrollSettingsClient } from "./PayrollSettingsClient";

/**
 * /settings/payroll — Employment Hero Payroll integration admin page.
 *
 * Lean v1: connection status + "Run sync now" + unmapped-users quick
 * list with click-through to staff profiles (where the per-profile
 * Link & sync button already lives). Deliberately no in-place mapping
 * table here — that flow lives on the staff profile and we don't
 * want two ways to do the same thing.
 */
export default async function PayrollSettingsPage() {
  const session = await requirePageSession();
  const role = session.user.role;
  if (role !== "owner" && role !== "admin" && role !== "head_office") {
    redirect("/settings");
  }
  return <PayrollSettingsClient />;
}
