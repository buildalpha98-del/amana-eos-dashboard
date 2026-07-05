import { redirect } from "next/navigation";

/**
 * 2026-07-05 nav consolidation phase 2: casual→regular conversions now
 * live as the "Conversions" view on /crm — one growth pipeline, one
 * front door. This stub keeps old links alive.
 */
export default function ConversionsPage() {
  redirect("/crm?view=conversions");
}
