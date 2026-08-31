import { redirect } from "next/navigation";

/**
 * The old anonymous enrolment wizard used to live here.
 *
 * `/enrol` was retired on 2026-07-30, but this path was deliberately
 * kept serving the wizard so that prefilled links already sitting in
 * families' inboxes wouldn't break — "removable once the sent ones have
 * aged out".
 *
 * 2026-08-13 — finished. Keeping it alive had a cost the note didn't
 * account for: every submission through it was an incomplete record.
 * That form never gained the National Regulations fields the current
 * one enforces — the doctor's address, immunisation status, the
 * emergency contact's address, who a court order restricts — because
 * those were added to the account flow only. A family who used an old
 * link produced an enrolment that looks complete in the queue and
 * isn't, which is worse than a link that no longer works.
 *
 * They aren't stranded, though, which is what the original note was
 * protecting against: the enquiry id travels on to signup, so the
 * family lands on the right form with their name and email already in
 * it. That is the destination the old link was trying to reach.
 */
export default async function EnrolWithTokenPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/parent/signup?enquiry=${encodeURIComponent(token)}`);
}
