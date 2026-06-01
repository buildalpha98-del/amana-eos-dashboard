import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { LeavePayrollClient } from "./LeavePayrollClient";

/**
 * /leave-payroll — admin org-wide view of EH-tracked leave.
 *
 * Lives separately from `/leave` (the internal-tracker page) until
 * that page is retired. New name signals "this is the payroll-of-
 * record view". Read-only — approvals stay in EH per the migration
 * decision.
 */
export default async function LeavePayrollPage() {
  const session = await requirePageSession();
  const role = session.user.role;
  if (role !== "owner" && role !== "admin" && role !== "head_office") {
    redirect("/dashboard");
  }
  return <LeavePayrollClient />;
}
