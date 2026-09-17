import { redirect } from "next/navigation";

/**
 * /recruitment moved to /hiring on 2026-09-16, where job ads, the candidate
 * pool and staff referrals sit together. Kept as a redirect so bookmarks,
 * the Position Descriptions back-link and anything already shared keep
 * working.
 */
export default function RecruitmentRedirect() {
  redirect("/hiring");
}
