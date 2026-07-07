import { redirect } from "next/navigation";

/**
 * Bare /survey/feedback (no service in the link) — send the parent to the
 * website's contact page rather than a 404. Real nurture emails always link
 * the per-service form at /survey/feedback/[serviceId].
 */
export default function FeedbackFallbackPage() {
  redirect("https://amanaoshc.com.au/contact");
}
