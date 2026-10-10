# Amana parent journey — 10 October 2026

Branch: `codex/amana-parent-journey`, based on merged main `26b7a35ccfb5e94c6f1c97058c47c78a17123bbd`.

## Operational boundary

OWNA remains the operational system while Amana awaits the approval described by the owner. Staff copy enrolment information into OWNA manually. The Amana family hub supports enrolment, school information and messages. An EOS confirmation is not evidence that an OWNA account exists, an invitation was sent, or sessions are ready to attend. This review does not interpret regulatory approval requirements.

## Production evidence (read-only)

Latest processed enrolment linked to MFIS-GA at the time of inspection:

- Form submitted 6 October 2026, 10:45 pm Sydney time.
- Staff confirmed 7 October 2026, 8:24 am Sydney time.
- Provider webhook records show delivery of the receipt and enrolment confirmation to the primary parent's mail server. No opened/clicked events were found; delivery does not prove the parent read the emails.
- No additional welcome invitation record. The centre contact existed from 23 September, and the code only automatically sends this invitation for newly created contacts.
- No OWNA mapping on the child or parent centre-contact record; no matching duplicate child record in that service. This does not prove no OWNA invitation was sent: OWNA's own invitation history was not accessible through the connected data source.
- Greenacre has address, telephone and email fields, but no custom service content. No centre-specific welcome, meeting point, map or onboarding narrative is configured.
- No production override exists for the `enrolment.confirmation` email template.
- This is an existing family: an earlier enrolment was confirmed 23 September. Its first-day reminder (27 September) and day-1 check-in (29 September) have delivered events. The active family-level onboarding sequence anchors to 28 September. Day 3 is cancelled; week-2 feedback is pending for 12 October, referral for 12 November (day 45), NPS for 27 November (day 60). There is no day-30 review step. Do not reinterpret these older-family follow-ups as evidence for the new child's OWNA setup.

No family names, addresses, medical details or email addresses are reproduced here. No production data changed and no email was sent.

## Implemented review build

- Amana-branded family home replaces the construction notice; parent page metadata no longer inherits Management Dashboard.
- Existing parent-scoped centre and enrolment APIs power the screen. Family-level approval is carefully worded because siblings can be in different stages.
- Explicit loading, failure/retry and missing-centre states. Missing-centre help uses public support because messaging needs a linked service.
- Phone navigation uses four large bottom tabs; Help and sign-out remain in the header.
- Restored sibling-enrolment entry; school links select the intended centre within the parent's permitted centres.
- Centre first-visit fallback asks families to confirm arrangements and explains flexible afternoon pickup.
- Emails explain Amana versus OWNA, remove unsupported 24-hour OWNA-access promises and unavailable booking/statement claims, and link to centre information.
- Booking/billing restrictions remain enforced. No OWNA provisioning, approval-status migration or production release is included.

## Acceptance and verification

- Pending/approved/mixed-family wording, missing centre, status API failure and booking-write rejection covered by focused tests.
- Full unit suite: 716 files passed; 7,520 tests passed, 3 skipped.
- Full lint: 0 errors, 1,123 existing warnings. Final standalone typecheck passed.
- Local synthetic account: login, school link and sibling-enrolment entry verified. Home and centre fit 320px; 390px visual pass performed. Additional final verification recorded below.
- Independent design and increment review: `/root/parent_journey_design_review`. Findings: aggregate approval caveat, distinguish API error/empty, preserve sibling link, use support when no centre. All addressed. Integrated re-review and focused follow-up completed; see final review additions below.

## Next operational outcome

Give staff a visible, auditable OWNA handoff checklist: assigned owner, child entered in OWNA, invitation sent (with date/evidence), family access confirmed, and first booked day confirmed. Keep these distinct from form review. Design this before adding persistent status fields; do not infer completion from imports or confirmation alone.

Greenacre content required from its team: exact gate/room/meeting point, session hours, pickup instructions, first-day packing list, service contact person, welcome message and optional approved photo/map. Do not fill these with guessed operational facts.

The sampled family's OWNA invitation still needs checking directly in OWNA. Existing families should retain their access; do not automatically issue duplicate accounts or invitations.

## Final review additions

- Account page explicitly explains that saving Amana details does not update OWNA; urgent contact/pickup changes should be confirmed with the service.
- Follow-up defaults now use the staff-managed OWNA invitation process and avoid hardcoded universal session hours in the first-session reminder. This does not alter production sequence configuration.
- Integrated reviewer `/root/parent_journey_integrated_review` found bottom navigation overlapping the sibling form toolbar; resolved by hiding the navigation on the enrolment form. Focused re-review passed. Browser confirmed unobstructed Back/Next while scrolling the Child step at 320px.
- Confirmation-link error screen now uses Amana logo/colours and was visually checked at 320px.

- Final targeted rerun: 137 tests passed (nurture email templates, welcome home and booking restrictions). Final focused lint has 0 errors; account page retains its pre-existing unused `toast` warning.
- First complete local webpack production build passed (compile, TypeScript and all 769 static pages), with existing Sentry Edge-runtime/deprecation warnings. The final-source production build also passed after the last copy changes (exit 0), including TypeScript and page generation.
- No merge, push, production deployment, production write or outgoing communication performed for this increment.
