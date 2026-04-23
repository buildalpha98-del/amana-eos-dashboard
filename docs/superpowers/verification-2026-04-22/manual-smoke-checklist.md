# Manual Smoke Checklist — 2026-04-22

Post-merge verification for PRs #21–#25 covering Services rebuild (4a/4b), Contracts + Recruitment (6), and Report Issue inbox (8a).

## How to use

1. Run `prisma/seeds/verification-seed.ts` against a test DB (see `README.md`).
2. Walk through this list in order. Tick each box.
3. Flag regressions with screenshot + note. Prefer filing via the in-app Report Issue widget (it tests another surface while you go).
4. All seeded accounts share the password `TestPass2026!`.

---

## Authentication + access control

- [ ] Log in as owner `jayden@amanaoshc.com.au` with `TestPass2026!` — lands on `/dashboard` with the full sidebar.
- [ ] Log in as staff `staff.amira@amanaoshc.com.au` — `/admin/feedback` is hidden from sidebar; direct visit redirects or 403s.
- [ ] Log in as `coord.riv@amanaoshc.com.au` — visiting `/services/MPK` returns 403 / redirects away.
- [ ] Log in as `akram@amanaoshc.com.au` (marketing) — `/children/[any-id]` loads read-only; no edit controls visible.
- [ ] Log out, hit `/parent/dashboard` directly — bounces to magic-link page (no staff session leaks into parent portal).

## Services Daily Ops (4a / 4b)

- [ ] Open `/services/RIV` as coord — default landing tab is Today.
- [ ] Switch to Overview sub-tab — approval numbers + session times card show BSC 06:30–08:45 / ASC 15:00–18:00 / VC 07:00–18:00.
- [ ] Roll Call > Weekly view — sign a child in on today's column; chip turns green with the sign-in time (HH:mm).
- [ ] Roll Call > Monthly view — click any weekday cell; drills into Daily view for that exact date (not ±1 day).
- [ ] Daily Ops > Casual Bookings — toggle ASC enabled → disabled, save. Reload. Setting persists.
- [ ] Daily Ops > Casual Bookings — update BSC fee from $36 → $38, save. Reload. Change persists.
- [ ] Children tab — filter by CCS status "eligible" → list narrows (expect ~24 of 40).
- [ ] Children tab — filter by Tag "siblings" → list narrows to tagged kids only.
- [ ] Children tab — filter by Room "R1" → list narrows to R1 kids.
- [ ] Click a child name → `/children/[id]` full page — all 5 tabs (Details, Medical, Relationships, Attendances, Notes/Documents) load without errors.
- [ ] Details tab — edit firstName from value to value + "X", save. Reload. Change persists.
- [ ] Medical tab — toggle anaphylaxis action plan, save. Reload. Change persists.
- [ ] Relationships tab — inline edit a secondary carer name; save. Reload. Change persists.
- [ ] Attendances tab — default view shows current month; displays seeded history (prior 30 days).
- [ ] Attendances tab > Export CSV — file downloads with correct filename and headers.
- [ ] Weekly grid — "+ Add child to week" dialog opens; select 3 children × 2 days, submit. Grid updates with new cells.
- [ ] Weekly grid — sign in on a past date cell, then reload — record stays on the correct date (UTC regression guard, see #24).

## Parent portal + casual bookings (4b)

- [ ] Seed or manually issue a magic link for a parent email (if no parent seeded, use the `POST /api/auth/parent/magic-link` route).
- [ ] Parent lands on `/parent/dashboard` — sees child summary.
- [ ] Parent opens `/parent/book` — attempt to book a VC casual session — returns 400 (VC disabled in seed).
- [ ] Parent books a BSC casual within cutOffHours (24h) and enabled days — returns 200, booking appears in list.
- [ ] Parent books a BSC casual past the cutoff (today + <24h) — returns 400 with cutoff message.

## Contracts + Recruitment (PR #6 / 4b)

- [ ] Log in as admin (`tracie@`). Navigate `/contracts` — list loads with 12 seeded contracts; filter by status "active" → 3 rows.
- [ ] Create new contract via "+ New Contract" — fill form, attach `documentUrl` (any URL), save. Row appears with doc icon.
- [ ] Log back in as staff (`staff.amira@`) — `/my/contracts` (or staff dashboard Contracts section) shows their active contract.
- [ ] Staff clicks "Acknowledge" — flag flips; button replaced by "Acknowledged on …" stamp.
- [ ] As admin, `/onboarding` — a new `StaffOnboarding` row exists for that user (triggered by acknowledge hook).
- [ ] `/staff/[id]?tab=contracts` as admin — contract history shows superseded chain (casual → upgrade).
- [ ] `/recruitment` — 4 seeded vacancies; 1 open RIV, 1 interviewing MPK, 1 filled SCH, 1 open RIV.
- [ ] Open the open RIV vacancy — candidate list shows 3 candidates; add one with resumeText pasted, save.
- [ ] Click "AI Screen" — aiScreenScore + aiScreenSummary populate within ~5s.
- [ ] CandidateDetailPanel — change stage dropdown (applied → screened) — optimistic update, persists on reload.
- [ ] CandidateDetailPanel — type in notes textarea, pause ~2s — auto-save indicator confirms write.
- [ ] `/recruitment?tab=referrals` — see 3 seeded referrals (pending, hired, bonus_paid).
- [ ] Click "Mark bonus paid" on the pending referral — modal confirm, save. Status updates to bonus_paid; bonusPaidAt timestamped.
- [ ] Sidebar as admin — "Contracts" link is visible.
- [ ] Sidebar as marketing (`akram@`) — "Contracts" link is hidden.

## Report Issue admin inbox (8a)

- [ ] As any non-admin user, click the floating feedback widget (bottom-right).
- [ ] Submit a bug with a message + page URL auto-filled — success toast shows "Thanks for the feedback".
- [ ] Log in as admin, visit `/admin/feedback` — new entry appears at top, 5 seeded entries below.
- [ ] Click the new entry — detail panel shows full message, page URL, author name + role, timestamp.
- [ ] Change status "new" → "in_progress" — badge updates immediately; reload confirms persistence.
- [ ] Type in admin notes, pause ~2s — auto-save indicator confirms write; `adminNotes` populated.
- [ ] Mark resolved — `resolvedAt` timestamp populates and shows in the list row.
- [ ] Rate-limit: submit 6 feedback from the same user inside 60s — 6th call returns HTTP 429.

## Leadership / Scorecard / Pulse (9)

- [ ] Owner opens `/leadership` — KPI cards load (placeholders ok if seed doesn't populate KPI history).
- [ ] Scorecard page > Rollup tab — org-wide view renders without errors.
- [ ] Contact Centre > Leaderboard tab — ranking shows seeded users (may be empty if no touchpoints yet — acceptable).

## Regression (from PR #24)

- [ ] Roll Call Weekly > sign in child on a specific date (e.g., yesterday) — record created with date == chosen date.
- [ ] Change system clock TZ (or re-open in an incognito with `Sydney` locale) — reload; chip still shows on the same date, not shifted ±1.
- [ ] Weekly grid > bulk sign-in across 5 weekdays → reload → all 5 records land on their exact days.

## Performance sanity

- [ ] Weekly grid with 40 children × 5 days — each chip click responds in <200ms (no visible stutter).
- [ ] Children list > filter by CCS + Room — list renders / refilters in <1s.
- [ ] Navigation between Services tabs (Today → Overview → Children → Medical) — each transition <500ms.

---

## Exit criteria

- Every box above ticked.
- Any failed check has a linked Report Issue entry (submit via widget) OR a GitHub issue with repro steps + screenshot.
- If anything touches data persistence, re-run the relevant `prisma/seeds/verification-seed.ts --reset` to confirm it seeds cleanly.
