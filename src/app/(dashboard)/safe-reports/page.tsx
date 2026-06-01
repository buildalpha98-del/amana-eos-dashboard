import { redirect } from "next/navigation";
import { requirePageSession } from "@/lib/server-auth";
import { SafeReportsClient } from "./SafeReportsClient";

/**
 * /safe-reports — owner / head_office triage for anonymous reports.
 *
 * Restricted to owner + head_office at the page level AND at every
 * API endpoint behind it. Admin role is deliberately NOT included
 * by default — the owner can extend that explicitly later if they
 * delegate the function.
 */
export default async function SafeReportsPage() {
  const session = await requirePageSession();
  if (session.user.role !== "owner" && session.user.role !== "head_office") {
    redirect("/dashboard");
  }
  return <SafeReportsClient />;
}
