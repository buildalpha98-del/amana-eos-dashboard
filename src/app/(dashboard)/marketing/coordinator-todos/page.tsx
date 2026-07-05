import { redirect } from "next/navigation";

/**
 * 2026-07-05 nav consolidation phase 2: folded into /marketing as the
 * Team Ops tab. This stub keeps old links alive.
 */
export default function Page() {
  redirect("/marketing?tab=teamops&sub=todos");
}
