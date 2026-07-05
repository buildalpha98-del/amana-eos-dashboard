import { redirect } from "next/navigation";

/** Retired 2026-07-05 (nav consolidation phase 1) — content lives in the
 *  Handbook & Help hub. Stub keeps old deep links working. */
export default function HelpRedirect() {
  redirect("/handbook?tab=help");
}
