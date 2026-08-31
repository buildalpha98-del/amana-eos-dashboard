import { redirect } from "next/navigation";

/**
 * The old anonymous enrolment form used to live here.
 *
 * Retired 2026-07-30. Enrolment now REQUIRES a parent account — the draft
 * saves against it, which is what makes "finish it later on your phone"
 * work and what links the enrolment to the family afterwards. The old
 * form also never gained this week's National Regulations fields (doctor's
 * address, immunisation status, emergency-contact address, who a court
 * order restricts) or the fee and privacy disclosures, so every
 * submission through it was an incomplete record.
 *
 * DELIBERATELY NOT redirected:
 *   - /enrol/status/[token] — families check a submitted enrolment there.
 *   - /enrol/[token]        — prefilled links already sitting in nurture
 *                             emails. Breaking those would strand
 *                             families mid-journey. The nurture template
 *                             now points at signup, so no NEW ones are
 *                             created; this path can be removed once the
 *                             sent ones have aged out.
 */
export default function EnrolPage() {
  redirect("/parent/signup");
}
