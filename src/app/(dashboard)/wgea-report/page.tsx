import { redirect } from "next/navigation";

/** Retired 2026-07-05 (nav consolidation phase 1) — content lives in the
 *  Workforce Reports hub. Stub keeps old deep links working. */
export default function WgeaReportRedirect() {
  redirect("/workforce-reports?tab=wgea");
}
