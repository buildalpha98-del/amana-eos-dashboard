# Handoff to Codex — 2026-10-09

Everything needed to carry on the Amana OSHC dashboard work in Codex. Read
`AGENTS.md` and `CLAUDE.md` first; this file is the "where we are" layer on
top of them.

---

## 1. Getting set up in Codex (do these once)

1. **Install Codex** (CLI `npm i -g @openai/codex`, or the Codex app / IDE
   extension) and sign in with your ChatGPT account.
2. **Open it in this folder**: `cd ~/Developer/amana-eos-dashboard && codex`.
   It reads `AGENTS.md` automatically; that file points it at `CLAUDE.md`
   and this handoff.
3. **Merge this handoff branch** (`docs/codex-handoff`) into `main`, or
   Codex won't see `AGENTS.md` once you switch branches.
4. **Brand + voice everywhere (optional but recommended)**: your global
   Claude brand guide lives at `~/.claude/CLAUDE.md`. Codex's equivalent is
   `~/.codex/AGENTS.md`. Copy it across yourself:
   `mkdir -p ~/.codex && cp ~/.claude/CLAUDE.md ~/.codex/AGENTS.md`
   The logo is at `~/.claude/amana-oshc-logo.png` if it exists.
5. **Local environment is already working** — nothing to reinstall:
   - `.env.local` → local Postgres (`amana_local` on port 5433 in the most
     recent sessions; check `DATABASE_URL`). Prod lives ONLY in
     `PROD_DATABASE_URL*`.
   - `npm run dev` → http://localhost:3000.
   - Local test logins come from the seed (`npx prisma db seed`) and
     `src/lib/test-utils/seed-test-data.ts` (`test-<role>@amana-test.local`).
     The centre login used for testing is `test-member@amana-test.local`
     (flipped to a centre account, role `member`, at MFIS Greenacre).
     Passwords are in the seed files — don't paste them into chats.
6. **Git / GitHub**: pushes work from the macOS keychain (GitHub user
   `buildalpha98-del`). `gh` is NOT installed. Commit identity is passed
   per command: `git -c user.email=jayden@amanaoshc.com.au -c user.name=Jayden commit …`.
7. **Vercel**: the token in `~/.zshenv` (`VERCEL_TOKEN`) has EXPIRED
   (`invalidToken`). Make a new one at vercel.com/account/tokens and put it
   in `~/.zshenv` yourself. Until then, check deploys through GitHub
   commit statuses:
   ```
   TOKEN=$(printf "protocol=https\nhost=github.com\n\n" | git credential fill | sed -n 's/^password=//p')
   curl -H "Authorization: Bearer $TOKEN" https://api.github.com/repos/buildalpha98-del/amana-eos-dashboard/commits/<sha>/status
   ```
   Only the `Vercel – amana-eos-dashboard` status matters. `project-ejd0c`
   and `capable-nature` fail on every commit (stray Vercel projects —
   worth disconnecting from the repo in Vercel when you have a minute).
8. **Production**: https://amanaoshc.company. Production migrations run
   automatically from `scripts/vercel-build.sh` on deploy.
9. **Claude-only tools you'll lose**: the in-app browser pane (Codex can't
   click around the app the same way — expect to check UI yourself, or use
   Playwright), Claude artifacts (the plan/mock-up pages linked below stay
   viewable on claude.ai), and my memory notes (summarised in §6).

---

## 2. How Daniel likes to work

- Voice-typed messages: "owner/Ona" = OWNA. Read for intent.
- **Bias to ship.** Make the call, explain briefly, iterate. Don't ask
  questions you can answer from the code.
- **Process for big pieces**: audit → plan + mock-up → Daniel approves →
  build → check on phone (375px) and desktop, per role.
- **Test as a centre login** (shared school email, `isCentreAccount`, role
  `member`) — that's the Coordinator. Also test as an educator (`staff`).
  Most staff use phones or the centre's door iPad: phone-first, big tap
  targets (`min-h-11`).
- **OWNA is the reference**, but copy the good models, not the long-daycare
  junk (nappies, sleep, bottles). See §6.
- **Toggle, don't replace** when changing an existing layout or template.
- When a feature touches OSHC compliance (NQF, regs, WWCC, incidents) or
  Islamic values, say so in the commit message.
- Push feature branches freely. **Merging to `main` needs Daniel's OK.**
- Don't propose what to build next unless asked — he tracks that.
- Parents are PARKED ("don't worry about the parents") — staff side only.
- Parents don't get sign-in/out emails (off by default; "dnt email parents").

---

## 3. What's shipped (staff-side OWNA push, all on `main`, live)

Approved plan: https://claude.ai/artifact/BSe64jJwxbsLGdEyhTHCjR
Staff vs OWNA checklist: https://claude.ai/artifact/GRBev4vJfqyUJerw52ie8M
Centre review page: https://claude.ai/artifact/7ED5eUa28wCernQt7NTvRo
Door iPad mock-up: https://claude.ai/artifact/SgiCAQJnyTjG5v1KErCxeV

| Commit | What |
|---|---|
| `af46e583` | **Today** like OWNA's home — per-room ratio cards (in ratio / need N more staff), staff signed in "since HH:MM", visitors, Needs-you box. Ratios tab moved to Compliance → Ratio log. `src/components/services/ServiceTodayHome.tsx`, `/api/services/[id]/dashboard` |
| `3ea1bc69` | **Staff menu**: Manage staff (add new starter — invite-only, emails, kiosk PINs, photos, edit name/phone) and Staff inductions (who isn't cleared + exactly what's missing + Remind). `src/components/services/staff/` |
| `83d53bb3` | **Attendances hub**: tabs Children attendances · Staff sign in & out (own row no PIN, others need their PIN) · Occupancy. `src/components/services/attendances/`, `/api/services/[id]/staff-clock`, shared `src/lib/shift-clock.ts` |
| `0f2896f9` | **Build Roster** (Staff → Roster): rooms × days grid with "staff / required / booked" (red when short), shift cards, + to add with room/day/preset prefilled, totals (shifts, hours, cost vs weekly limit, bookings per staff hour), Copy last week, Publish. Phone = one day at a time. Tabs: Build roster · By person · Staff summary · Shift requests · Settings. Settings stored in `appSettings.roster.{shiftPresets, weeklyCostLimit}`. `src/components/services/staff/BuildRoster.tsx` |
| `488e32e1` | Timeclock fixed for UTC servers (auto/kiosk clock-in now finds the shift) |
| earlier | Hazard log, roster acknowledgements + open-shift "hand up", centre Messages, door iPad Parent/Service mode, Configure (rooms/fees/closures/settings), Children + Families as their own sections |

Centre page structure lives in `src/lib/service-sections.ts`
(`resolveSectionLink` + `SECTION_ALIASES` remap retired links). Inside a
section, components keep their own URL params (`rosterView`, `att`,
`rollCallView`) — **never write `sub` from inside a section**. A guard test
fails on links to sections that don't exist.

---

## 4. What's next (in Daniel's order)

### 4.1 Logs / Timesheets — rostered vs actual (NEXT)
Lives in the centre's **Staff** dropdown as a 4th item ("Timesheets").
**Default view: WEEKLY** (Daniel's explicit answer — not fortnightly).
- Week picker (reuse `WeekPicker`). One row per person per shift:
  rostered start–end vs actual clock in–out (`RosterShift.actualStart/
  actualEnd`), difference in minutes.
- Highlight: late in (> 5 min), early out, no clock-in, clock-in with no
  rostered shift, still clocked in.
- Totals per person: rostered hours, actual hours, difference.
- Coordinator (centre login) can approve; office can approve + export.
  REUSE what exists: `/api/timesheets` (+ `bulk-approve`,
  `generate-from-timeclock`, `summary`), `approveTimesheet()` in
  `src/lib/timesheet-approve.ts` (self-approval is rejected server-side),
  Export CSV is the real export path (Xero is a stub behind a flag).
- Add the sub-tab in `service-sections.ts` (staff group), render in
  `src/app/(dashboard)/services/[id]/page.tsx`.

### 4.2 Custom checklists created by Coordinators
Today checklists only come from the seed and cowork
(`/api/services/checklists/seed`, `/api/cowork/services/[code]/checklists`).
Coordinators need to create their own **templates**: name, session
(BSC/ASC/VC), due time, days of week, items (label, category, required).
Templates generate items into the day's checklist.
⚠️ Schema note: `DailyChecklist` is unique per `(roomId, date)` — ONE
checklist per room per day. Either add template items into that one
checklist (grouped by template name via `category`), or change the model
(migration). Decide before building. UI: Configure → Checklists, or a
"Manage templates" button on Daily Ops → Checklists.

### 4.3 Attendances — OWNA-style daily / weekly / monthly booking views
Daniel sent OWNA screenshots. Children tab already has Day/Week/Month. Still
needed: weekly room table (booked / capacity per room per day), per-child
weekly grid, monthly grid with totals.

### 4.4 Remaining staff-vs-OWNA items
- Checklist named sign-off + daily "3 of 4 done" report.
- Child-safe concerns register (ACECQA Child Safe Culture — complaints,
  concerns, allegations, disclosures; confidential; separate from
  `ComplaintRecord`).
- Policy yes/no check questions on acknowledgement.
- Ease-of-use pass on every staff screen at phone width.

### 4.5 Unanswered questions for Daniel
- Which enrolment email is real: `enrolment@` or `enrolments@`?
- Shared-care CCS handling.
- Regular outings authorisation.
- Family PINs for the door iPad come later by mass email (slot left in
  `src/lib/door.ts`).

### 4.6 Bigger picture (not now)
OWNA full replacement is blocked on CCS (PRODA / Services Australia) and a
payment gateway. **Do not extend the stored-card (PAN) data** — billing
must tokenise at the gateway (PCI). Other deferred ideas (EOS meeting
camera, post-enrolment school comms flow, parent-editable payments) —
don't build unprompted.

---

## 5. Hard-won gotchas (each one has bitten)

- `prisma migrate diff --shadow-database-url $DATABASE_URL` **wipes that
  database**. Generate migrations file-to-file:
  `git show main:prisma/schema.prisma > /tmp/old.prisma && npx prisma migrate diff --from-schema-datamodel /tmp/old.prisma --to-schema-datamodel prisma/schema.prisma --script`.
  Apply locally with `DATABASE_URL_UNPOOLED=$DATABASE_URL npx prisma db push` (localhost only).
- After switching branches, run `npx prisma generate` or the client is stale.
- `POST /api/users` wants `startDate` as a full ISO datetime.
- Toasts: `toast({ description })` — description is required.
- Buttons: use `Button` from `@/components/ui/Button`; icon-only buttons
  need `aria-label`.
- Vercel runs in UTC: anything "today"/"this week" must use the Sydney
  helpers (`serviceTodayISO`, `serviceWeekStart`, `serviceDayBounds`,
  `serviceMidnight`). Tests with clocks need explicit `+10:00`/`+11:00`.
- `useUnreadMessageCount` must stay gated by `canReadParentMessages`
  (educators got 403 toasts).
- `npm run lint` is scoped to `src` + `tests`; 0 errors is enforced in CI.
- Inline role arrays fail a guard test — use `[...ADMIN_ROLES]`.

---

## 6. Background notes (from Claude's memory)

- **OWNA audit**: OWNA is long-daycare with OSHC bolted on. Worth copying:
  Rooms (capacity, ratio override, fees), first-class excursions with risk
  assessments, headcounts/evacuations, custom forms with audience
  targeting, the Configure layout (one panel, tabs, each setting = bold
  title + switch + one plain sentence). Not worth copying: their home
  dashboard assembly, numbered unnamed session slots, LDC settings.
- **Centre decisions (2026-10-09)**: one parent inbox (office Contact
  Centre) with a centre-scoped view; Sign in/out + roll call merged into
  one door screen; each centre has ONE door iPad with Parent mode (tap
  child, signature; PINs later) and Service mode (staff clock-in,
  visitors, RP) — leaving Parent mode needs a staff PIN; only enrolment
  parents/guardians sign on the iPad; court-order children always signed
  out by an educator ("Please see an educator"); "Director" is now
  "OSHC Coordinator".
- **Employment Hero** fronts payroll (bank/super/onboarding); TFN stays in
  EH Self Setup.
- **SharePoint** policy sync is connected (Entra app; env vars
  `MS_GRAPH_CLIENT_ID` / `MS_GRAPH_TENANT_ID` / `MS_GRAPH_CLIENT_SECRET`,
  see `src/lib/ms-graph.ts`).
- **Welcome packs** generator lives on `feat/welcome-pack-redesign`
  (pending emails/photos from Daniel).

The raw notes are in
`~/.claude/projects/-Users-daniel-Developer-amana-eos-dashboard/memory/`
if you want to keep them — they're not committed (personal machine notes).
