import { redirect } from "next/navigation";

/**
 * 2026-07-05 nav consolidation phase 2: the operational reports
 * dashboard now lives as the "Reports" view on /performance so
 * analytics has a single front door. This stub keeps old links alive.
 */
export default function ReportsPage() {
  redirect("/performance?view=reports");
}
