/**
 * Wording the Help Centre seed SHIPPED with, before 2026-10-06, for the
 * articles that sent parents to the Amana app to book, cancel, mark absences
 * or update details. The app is locked for bookings (parents use OWNA), so
 * these answers had become wrong.
 *
 * seedHelpCentre() replaces an article with its current seed text ONLY when
 * its body still matches the text below exactly — so an article an admin has
 * edited at /help-centre is never touched. Idempotent: once revised, the body
 * no longer matches and nothing happens on later deploys.
 */
export const PREVIOUS_SEED_BODIES: Record<string, string> = {
  "how-do-i-enrol-my-child-at-amana-oshc": `Enrolling takes about ten minutes online:

1. Open our enrolment form at **amanaoshc.company/enrol** (or ask your school's Amana coordinator for the link).
2. Fill in your child's details, your contact details, and any medical or dietary needs.
3. Choose the days you'd like — permanent before-school, after-school, or both.
4. Submit the form. Our team reviews every enrolment and confirms by email, usually within two business days.

Once your enrolment is confirmed you'll receive a welcome email with your first-day details and how to set up the parent app.

**Tip:** if you plan to claim the Child Care Subsidy (CCS), start your CCS claim with Services Australia early — see the *Payments & CCS* section. You can enrol before your CCS is approved.`,
  "how-do-i-book-a-casual-day": `Casual bookings are for days outside your child's regular schedule — a one-off work commitment, an appointment, or a change of plans.

1. Log in to the **Amana parent portal** and open **Bookings**.
2. Pick the date and session (before or after school care) you need.
3. Submit the request. The centre team reviews it against that day's capacity and educator-to-child ratios and confirms by email.

A casual booking isn't guaranteed until it's confirmed — popular days can fill up, so book as early as you can.

If you can't see the day you need, or it's for **today**, please call your centre directly so the team can help straight away.`,
  "how-do-i-change-or-cancel-my-childs-booked-days": `**Permanent (recurring) days**

To change your child's regular schedule — for example moving from Tuesday to Wednesday, or adding a day — send the request through the parent portal messages or email your centre. Changes to permanent bookings take effect from the following week once confirmed.

**Casual bookings**

Casual bookings can be cancelled from the **Bookings** page in the parent portal. Please give as much notice as you can — it frees the place for another family.

**Cancellation notice**

Sessions cancelled with less than the required notice period may still be charged, in line with our enrolment terms. Allowable absences under CCS may still apply to charged sessions — see *Payments & CCS*.`,
  "my-child-will-be-absent-what-do-i-need-to-do": `If your child is enrolled for a session but won't attend:

1. **Tell us before the session starts** — mark the absence in the parent app, or message/call your centre. This matters most for after-school care: if your child doesn't arrive from class and we haven't been told, our team must treat it as a missing child and will begin follow-up immediately.
2. For illness, let us know anything we should be aware of — some conditions have exclusion periods to protect other children (see *Policies & Safety*).

Charged absences generally still count toward your CCS allowable absences, so you usually still receive your subsidy for that session.`,
  "who-is-allowed-to-collect-my-child": `Children are only released to:

1. **Parents/guardians** listed on the enrolment, and
2. **Authorised contacts** you've nominated — grandparents, friends, a nanny.

Anyone our educators haven't met before will be asked for **photo ID**, which is checked against your authorised list. This can feel formal, but it's how we make sure "Nana is picking up today" is really Nana.

**To add or change authorised contacts,** update your details in the parent portal or message your centre. In an emergency, you can phone the centre and authorise a one-off collection verbally — the team will still ID-check the person at the door.

If a court order affects who may collect your child, please give the centre a copy so the team can uphold it.`,
};
