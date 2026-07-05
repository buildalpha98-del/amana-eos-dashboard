import { redirect } from "next/navigation";

/** Retired 2026-07-05 (nav consolidation phase 1) — the internal feedback
 *  inbox is now the "Internal Feedback" tab on /feedback. */
export default function FeedbackInboxRedirect() {
  redirect("/feedback?tab=internal");
}
