# Dashboard page + UI/UX audit — 2026-09-25

Full sweep of all **165 routes** in `src/app`, scored for functional completeness,
mapped for inbound/outbound links, and checked against the design system.

Method: 12 parallel agents (10 page clusters + design-system census + nav/permission
integrity), each working to a shared rubric and required to cite `file:line`.
Every finding marked **[verified]** was re-confirmed directly against the source.

Scoring: **10** shipped, no gaps · **7–9** solid, specific gaps · **4–6** functional
skeleton · **0–3** stub, dead, or broken.

---

## 1. Headline

The app is in better shape than a 165-route surface has any right to be. The house
standards (`retry: 2` + `staleTime`, `onError` destructive toasts, `withApiAuth`,
design tokens) are genuinely adopted in the hook layer — most clusters found
**100% mutation `onError` coverage**. There is no cluster of abandoned stubs.

The problems are concentrated in three places, and they rhyme:

1. **Infrastructure built, then applied to a fraction of the codebase** — the
   anti-pattern at the top of your own CLAUDE.md. `ADMIN_ROLES` is the worst case:
   defined explicitly to stop drift, used by 38 API files, ignored by 212.
2. **Consolidation debt** — the 2026-07-05 nav consolidation left redirect stubs
   behind. Most were done correctly. Three were not, and are unreachable dead code.
3. **Off-system colour** — a purple/violet "AI content" convention that exists
   nowhere in the palette, repeated across ~12 surfaces by copy-paste.

---

## 2. Verified defects, worst first

### 2.1 Activity-library uploads are broken in production — **critical** [verified]
`src/app/api/activity-templates/[id]/files/route.ts:3,85-92` writes with
`fs/promises.writeFile` to `process.cwd()/public/uploads`, then stores
`fileUrl: "/uploads/<name>"`. On Vercel that filesystem is read-only outside `/tmp`
and ephemeral per invocation — the write fails or the file evaporates, and the DB
row points at a 404. Same class as the 2026-08-25 WWCC incident that
`uploadFileSmart` + `/api/upload/blob-token` exist to prevent.

### 2.2 Careers resume uploads silently 413 — **high** [verified]
`src/app/(public)/careers/[id]/CareerApplyForm.tsx:16-27,49-65` base64-encodes the
resume and posts it inline as JSON. The client allows 10 MB; base64 inflates ~33%,
so anything over ~3.4 MB is rejected at the Vercel edge before the route runs — no
server log, generic error to the applicant. Job applications are lost silently, on
a public conversion form.

### 2.3 `ADMIN_ROLES` built, applied to 15% — strands the `eos` role — **high** [verified]
`src/lib/role-permissions.ts:11` defines `ADMIN_ROLES` with the comment "prevent
drift across call sites."

| | files |
|---|---|
| use the shared `ADMIN_ROLES` | **38** |
| hardcode `["owner","head_office","admin"]` | **212** |
| mention `"eos"` at all | **10** |

`role-permissions.ts:507` grants `eos` `allPages.filter(p => !ADMIN_EXCLUDED.has(p))`
— "effectively admin-level page access". So an EOS Member opens a page the sidebar
offered them and gets a 403 from its API. Confirmed at `/api/data-room/route.ts:262`
and `/api/audit-log/route.ts:13`. Same `VALID_ROLES` class already logged in
`project_eos-roles.md`.

### 2.4 Three redirect stubs are unreachable dead code — **medium** [verified]
`src/middleware.ts:59-65` bounces to `/dashboard` when `canAccessPage()` is false,
*before* the page runs — so a stub must be registered in `allPages` or its
`redirect()` never fires. `role-permissions.ts:170-173` documents this and keeps
`/handbook` + the four `/tools/*` stubs registered for exactly that reason.

Missed: **`/staff`**, **`/wgea-report`**, **`/diversity-dashboard`** — 0 occurrences
each. Dead for every role including owner. (`pathMatches()` compiles `/staff/[id]`
to `^/staff/[^/]+(?:/.*)?$`, which does not match bare `/staff`.)

### 2.5 ~~`/api/queue/all` has no role restriction~~ — **WITHDRAWN, was wrong**
This finding was incorrect and is retracted. The `roles` option is passed at the
*end* of the file — `src/app/api/queue/all/route.ts` closes with
`}, { roles: ["owner", "head_office"] });`. My verification read only the opening
lines of the route and concluded from the bare `withApiAuth(async (req, session)`
that no option was supplied. The route is in fact gated *more* tightly than the
page's own admin nav gate. No change needed, and none was made.

### 2.6 Coordinators have no path to their own centre's P&L — **medium**
`/financials` is offered in the sidebar to `ALL_NON_MARKETING` (`nav-config.ts:204`)
but `member`/`staff` have no `/financials` entry in `rolePageAccess`, so the link
403s them to `/dashboard`. The per-service Financials sub-tab was deliberately
deleted (`services/[id]/page.tsx:249-253`) on the assumption sidebar access exists.
For a Service Coordinator, it doesn't.

### 2.7 Audit-log search and CSV export silently cover one page — **medium**
`src/app/(dashboard)/audit-log/page.tsx:130-167` filters and exports client-side over
the currently-loaded 50 rows only. A security audit trail that under-reports without
saying so.

### 2.8 Smaller confirmed breaks
- `/settings/seed` "OSHC Policies" posts to `/api/policies/seed`, which does not exist.
- `/queue/all` row click pushes `/queue?userId=` — never read by the page, the hook,
  or the API. Fully inert.
- `/billing/aged-debtors:396` links to `/billing/statements`, which has no page.
- `/marketing/qr-codes` redirect drops `?activationId=`, so every activation QR
  deep-link lands unscoped.
- `slack-webhook.ts:17` builds `/admin/feedback?id=`; the redirect drops the param,
  so Slack alerts never open the right item.

---

## 3. Genuine 10/10

Only two pages came back with no gap found against the full rubric:

- **`/notifications`** — cursor pagination, Today/Earlier grouping, mark-one and
  mark-all both `onError`-toasted, `retry: 2` + `staleTime` throughout, icon buttons
  44×44 with `aria-label`.
- **`/parent/enrol`** — account-backed autosave with 1.2s debounce and flush-on-unload,
  shared client/server step-completeness rules, mobile-first sticky CTA, and a
  *documented, reasoned* exception to the onError-toast rule rather than an omission.

Close behind at 9: `/dashboard`, `/rocks`, `/contracts`, `/reset-password`, the whole
`/support` sub-tree, `/reports/board`, `/workforce-reports`, `/my-portal`, `/my-day`,
`/my-expenses`, `/my-training`, `/profile`, `/learn/[enrollmentId]`, `/crm`,
`/marketing`, `/requests`, `/children/[id]`, `/parent/children`, `/parent/my-centre`,
`/enrolments`, `/holiday-quest`, `/services/[id]`.

---

## 4. Needs building further

### Dead or near-dead — delete or wire up
| Route | State |
|---|---|
| `/staff`, `/wgea-report`, `/diversity-dashboard` | unreachable stubs (§2.4) |
| `/parent/getting-started` | superseded by `AddToPhoneCard`, zero inbound links |
| `BookingsV2.tsx` + `MessagesV2.tsx` | 929 lines behind a flag never set in prod |
| `/reports` | works, but zero inbound links and no nav entry |
| `/queue/all` | duplicates `/queue`'s own "All Queues" toggle; its one interaction is inert |

### Built well, but nobody can find it
| Route | Score | Problem |
|---|---|---|
| `/parent/children/[id]/all-about-me` | 9 | zero inbound links anywhere |
| `/safe-report` | 9 | zero inbound links — an anonymous-reporting channel with no in-app path |
| `/crm/templates` | 6 | `/crm` doesn't link to its own templates page |
| `/help-centre` | 7 | zero inbound links; three unlinked "help" surfaces coexist |
| `/knowledge` | 6 | sidebar only |
| `/careers`, `/careers/[id]` | 6 | in-app orphans; admin UI points at the external site instead |
| `/services/[id]/booking-requests` | 9 | zero inbound links; duplicate pipeline vs the real bookings inbox |

### Weakest real pages
| Route | Score | Why |
|---|---|---|
| `/queue/all` | 3 | redundant + inert drill-down + unscoped API |
| `/leave`, `/leave-payroll` | 5 | deprecated, yet 3 staff-facing surfaces still link staff to `/leave` instead of `/my-leave` |
| `/settings/seed` | 5 | one dead endpoint |
| `/accountability-chart` | 6 | no error state at all — a failed fetch reads as "no chart yet" |
| `/audit-log` | 6 | §2.7 |
| `/compliance/registers` | 7 | 2 of 3 mandated NQF registers are honest placeholders |
| `/tools/ccs-calculator` | 6 | always uses hardcoded rates — the exact bug already fixed in `EnquiryDetailPanel` |
| `/recruitment` | 6 | `alert()` on mutation failure |
| `/position-descriptions` | 6 | no `retry: 2`, plain-text error |

### Architecture
- **`/timesheets`** — 2240 lines, six modals defined inline, and the only major
  feature area with **no `src/components/timesheets/` directory at all**.
- **`/my-portal`** — 2001 lines; ~13 cards correctly extracted, ~800 lines never were.
- **Three parallel "enrol a child" implementations** in the parent portal:
  `/parent/enrol`'s wizard, `EnrolmentWizard` at `/parent/children/new`, and
  `SiblingEnrolmentForm` (860 lines) at `/parent/enrolments/new`.
- **Two parallel child-detail UIs**: `ChildDetailPanel.tsx` (984 lines) vs
  `ChildProfileTabs` — duplicated medical/pickups/documents.

---

## 5. Recurring standards gaps

Not blocking, but each is a systemic sweep rather than a one-off:

| Gap | Where |
|---|---|
| Error state conflated with empty state | `/accountability-chart`, `/children`, `/billing`, `/parent/billing`, `/parent/messages`, `/parent/bookings`, `/parent/my-centre`, `/enrolments`, `/waitlist`, `/incidents` |
| Query missing `retry: 2` or `staleTime` | `/families`, `/families/[id]`, `/my-contract`, `/waitlist`, `/audit-log`, `/surveys`, `/position-descriptions`, `/safe-reports`, `/leave-payroll`, `/financials/family-balances`, 4 inline queries on `/compliance` |
| Table with no mobile card fallback | `/team`, `/families`, `/crm/templates`, `/documents`, `/feedback`, `/audit-log`, `/billing/aged-debtors`, `/reports/board`, `/parent/billing`, `/compliance/registers`, `RockListView` |
| Icon-only button without `aria-label` (`title` is not a substitute) | `/compliance`, `/compliance/templates`, `/documents`, `/scorecard`, `/projects`, `/settings`, `/assistant`, `/queue`, `/activity-library`, `/incidents`, `/parent/messages/[id]` |
| Hand-rolled button instead of `@/components/ui/Button` | `/todos`, `/incidents`, `/roster/me`, `/roster/swaps`, `/position-descriptions`, `/recruitment`, `/reports/board`, `/billing`, `PrintActions`, `/compliance*` (zero `Button` imports across 3169 lines) |
| Tap target under 44px on a staff-facing page | `/my-pay`, `/my-contract`, `/my-training`, `/profile` (20px hover-only avatar remove), `/learn`, `/services/[id]/parent-communication` (~30px) |
| Raw `fetch` bypassing `fetchApi`/`mutateApi` | `ServiceContentTab`, `/kiosk`, `/roster` `ShiftEditModal`, `/recruitment`, `/enquire`, `/settings/organisation`, board-report AI calls |
| Raw `try/catch` returning `{error}` inside `withApiAuth` | all `/api/reports/board/*` routes |

---

## 6. Missing cross-links worth adding

Highest value first — each is a place a user currently has to go back to the sidebar:

1. `NotificationPopover` → `/notifications`. The bell dropdown is a dead-end scroll
   list; the full inbox (the cluster's only 10/10) is unreachable from it.
2. `StaffDashboard.tsx:595` + `LeaveTab.tsx:61` point staff at the deprecated
   `/leave` instead of `/my-leave` — contradicting `/leave`'s own migration banner.
3. `OrgChartView` seats → `/staff/[id]`.
4. `StaffProfileStatsPanel.tsx:50` next-shift → `/roster/me?userId=` (the param is
   already implemented).
5. `ChildDetailV1` Info tab → `/parent/children/[id]/all-about-me`.
6. `/children/[id]` → `/families/[id]` (the reverse link already exists).
7. `/crm` → `/crm/templates`.
8. `/compliance/registers` Reg 146/147 placeholders tell you to use the documents
   library but carry no `href="/documents"`.
9. `/billing/aged-debtors` ↔ `/financials/family-balances` (who owes ↔ the chase log).
10. `/scorecard` + `/leadership` rollup rows → the service or person behind a red cell.
11. `/waitlist` from the enquiry pipeline — a waitlisted enquiry is literally what
    `/waitlist` manages, and nothing links to it.
12. `MobileTabBar` carries no unread badge although `useUnreadNotificationCount` exists.

---

## 7. Navigation, permissions & reachability

Classification of all 165 routes: **A (in sidebar + linked) 51 · B (sidebar only,
no contextual links) 10 · C (linked, deliberately folded) 75 · D (orphan) 29.**

### 7.1 `/waitlist` is invisible to every role — **critical** [verified]
`nav-config.ts:236` declares it `core: true` for `ALL_NON_MARKETING`. It appears
**0 times** in `role-permissions.ts`. `filterNavItems` calls `canAccessPage` first,
and `owner: allPages` — so the nav item is dropped for all nine roles, and it has
no contextual inbound links either. A shipped feature reachable only by URL.
One-line fix: add `"/waitlist"` to `allPages`.

### 7.2 ~30 dashboard pages have no edge auth or role check — **critical** [verified]
`src/middleware.ts` uses a hand-maintained matcher listing 54 non-API prefixes, and
`src/app/(dashboard)/layout.tsx` is `"use client"` with **no server session guard**.
A route absent from the matcher gets neither the `authorized` callback nor
`canAccessPage`.

Spot-checked — **not** in the matcher: `/waitlist`, `/roster`, `/leadership`,
`/billing`, `/notifications`, `/knowledge`, `/bookings`, `/families`.
In the matcher: `/children`, `/queue`, `/audit-log`, `/automations`, `/recruitment`,
`/incidents`.

`/leadership` is admin-only in the nav; anyone can open the page. Severity is
**authorization, not data exfiltration** — the backing APIs are correctly gated, so
an Educator opening `/leadership` gets chrome and failing cards. But the role model
is advertised and unenforced on ~30 pages, and every new page under an unlisted
prefix inherits the hole silently.

Fix: replace the enumerated matcher with a negative-lookahead pattern and let
`canAccessPage` + `allPages` be the single gate.

### 7.3 Induction locked-mode is enforced in one nav surface of three
Good news first: the gate is **satisfiable**. All four blockers in
`getInductionReadiness` point at pages a locked user can reach and self-serve —
`/my-training`, `/compliance` (cert upload), `/policies`, `/profile` (emergency
contacts). The 2026-08-25 deadlock is genuinely closed.

But only `Sidebar.tsx:78` applies `isInductionAllowedPath`:
- **`MobileTabBar.tsx:26-31`** — a locked staff user's four tabs are `/my-portal`,
  `/my-day`, `/my-pay`, `/my-leave`. **All four are outside the allowlist**, so
  every tab bounces to `/my-training`. Their entire phone nav is dead on tap.
  (Recoverable via More → drawer, which is the Sidebar and correct.)
- **`TopNav.tsx:47-50`** — no induction filter at all.
- `CommandPalette` likewise.

### 7.4 Dead `allPages` entry
`role-permissions.ts:153` registers `"/roll-call"`. No such page exists (removed
2026-04-29). Delete.

### 7.5 IA
- **Section contiguity broken twice** — `/requests` (Operations) and
  `/centre-avatars` (Growth) sit inside the Marketing block (`nav-config.ts:257-258`).
  No longer produces duplicate headers (Sidebar switched to global Map dedup
  2026-07-08), but first-seen-wins ordering strands both at the end of their sections.
- **`Home` is a one-item section** rendering a whole header for `/dashboard`. Fold it.
- **`My Portal` has 14 items and zero overflow** — the curation tier does nothing
  there; a staff user gets 11 personal links before the work starts, which is the
  exact complaint that created the section.
- **`Admin` has no `core: true` item at all** — `/automations` and `/audit-log` are
  monitoring surfaces buried behind "+5 more" for the people who own them.
- **`Settings` hides 5 of 6 items**, including `/settings/organisation` and
  `/settings/permissions` — defeating the extraction that created the section.
- **`eos` can open 118 routes and sees 44** — the widest gap of any role. It's absent
  from most nav `roles` allowlists despite mirroring admin page access. `/scorecard`
  is the clearest miss: `nav-config.ts:184` omits `eos` from an EOS role's primary surface.
- **`/profile` is accessible to all nine roles and is a nav item for none.**
- **29 of 165 route files (18%) are ≤30-line redirect stubs.** Moving them to
  `next.config` redirects would shrink `allPages` by ~14 entries and delete the
  middleware-matcher maintenance burden for each.

---

## 8. Design system — does it look AI-generated?

**Verdict: the tokens are clean; the composition is not.** The copy is genuinely
free of LLM marketing-speak — zero hits for "Comprehensive / Seamlessly / Powerful",
zero exclamation marks in title props. The 2026-07-11 gray sweep held: **0** raw
`text-gray-*` / `bg-gray-*` remain.

The tell is structural: **the app is built from one card and one heading, repeated,
and it has no second gear.**

### 8.1 The census

| Signal | Count |
|---|---|
| Raw Tailwind grays/slates in `className` | **0** — the rule held |
| Hex literals in **props/`style`** (the lint rule's blind spot) | 26 non-chart files; `#6B7280`×42, `#E5E7EB`×31 — **the grays came back as hex through props** |
| Identical `bg-card rounded-xl border border-border p-6` card | **228** |
| Distinct card treatments (bg+radius+border+shadow) | **62** over 1,972 nodes |
| Distinct heading class strings | **294** — `h3`, `h2` and `h1` all render `text-lg font-semibold` |
| PageHeader adoption | **57 / 165** pages (35%); and it emits `<h2>`, so those pages have **no `h1`** |
| Hand-rolled brand/destructive buttons | **214 across 147 files** |
| Local `StatCard` re-implementations shadowing the shared one | **10** |
| Hand-rolled modal shells | 127, incl. **4 in `timesheets/page.tsx` alone** |
| Backdrop opacities in use | **10 distinct** |
| Radius values in use | **9 distinct** |
| Stock `shadow-*` vs `shadow-warm*` | **484 vs 56** |
| Semantic token adoption | `text-success` 14 vs raw green **667**; `text-danger` 48 vs raw red **855**; `text-info` **0** vs raw blue 225 |
| Off-palette hues | purple **539**, indigo 90, sky 72, cyan 54, violet 21 |
| `animate-in slide-in-from-*` | 16 uses — **`tailwindcss-animate` isn't a dependency**, so `Dialog`, `Sheet` and `toaster` have no entry animation at all |
| `[data-v2="staff"]` density overrides | wired into 16 files; **`(dashboard)/layout.tsx` doesn't set it**, so the block is ~98% dead |

### 8.2 The specific tells
1. **The 11-card stack.** `my-portal/page.tsx` has eleven identical bordered boxes
   down one page; `settings/SettingsContent.tsx` fifteen. Every section is a card
   because nothing decided which sections matter.
2. **h1 = h2 = h3.** Three semantic levels render pixel-identical, while 294 distinct
   heading strings exist — variety *without* hierarchy, the worst combination.
3. **Decoration with no referent.** `EmptyState.tsx:53-61` draws concentric circles at
   `opacity-[0.03]`; `StatCard.tsx:70-72` puts a `linear-gradient(…99, transparent)`
   bar on top of every tile. That gradient hairline is the visual signature of a
   generated dashboard.
4. **Stat tiles as furniture.** 71 files carry a 4-across KPI row.
   `timesheets/page.tsx:2086` opens with four tiles above a table showing the same numbers.
5. **Sub-navigation invented three times** — `marketing/page.tsx` twice, `rocks`, plus
   `PageHeader`'s own private segmented control: three visual languages for "pick one of N".
6. **Emoji instead of Lucide** in a product that ships Lucide —
   `requests/NewRequestModal.tsx:21` maps types to `📄 🎪 🏷️`.
7. **Subtitles that restate titles** — 21 `description=` props starting Manage/Track/View.

### 8.3 Where the craft is — pull the rest toward these
- **`ui/v2/DataTable.tsx`** — virtualized, `j/k` + arrow + Home/End + Shift+Space range
  select, sticky first column. Used by 13 files while **114 hand-roll `<table>`**.
- **`ui/v2/SectionLabel.tsx`** — the right answer to "how do I title a section":
  a quiet 10px uppercase label, no box. Used in 11 parent files, **zero staff files**.
- **`app/parent/HomeV1.tsx`** — best-composed page in the repo: a real `h1`, quiet
  section heads, 44px targets, list rows instead of nested cards, one chip vocabulary.
- **`globals.css` itself** — the `@theme` reasoning, the `backwards`-not-`both` fill-mode
  note, the safe-area `max()` comment. **The system is better documented than it is applied.**

### 8.4 The refinement spec
Ordered by leverage. Full detail in §8.1–8.3 above; each item names its blast radius.

**Tier 1 — systemic**
1. **Turn on the density scale** — add `data-v2="staff"` to `(dashboard)/layout.tsx`.
   One line; activates the dormant radius/shadow overrides across every page.
2. **Strip the decoration from `StatCard` + `EmptyState`** and replace `StatCard`'s
   raw-hex `iconColor` prop with a `tone` union. Two files; ~200 sites improve free.
3. **Ship a `Card` primitive with exactly 2 variants** (`panel`, `bare`) and retire the
   228 inline copies. Deciding which sections stop being cards *is* the fix — do
   `my-portal` first as the reference (of 11 stacked cards, at most 3 should stay).
4. **Fix the type ramp**; make `PageHeader` emit `h1`. Define `.t-page` / `.t-section`
   / `.t-card` and forbid ad-hoc heading classes.
5. **Adopt the semantic status tokens** — 2,286 raw status utilities bypass four tokens
   that already exist; 23 files use emerald *and* green for the same meaning.
6. **One modal shell, one backdrop** — `ui/Dialog` already has 57 consumers; convert
   the 49 hand-rolled shells and collapse 10 backdrop opacities to one.

**Tier 3 — mechanical sweeps** (codemod-safe): stock shadows → warm; radius scale
9 → 4; status colours → tokens; `bg-white` → `bg-card`; normalise the
`text-[color:var(--color-X)]` syntax back to `text-X`.

**Stop the drift returning**: the `design-token-rails` ESLint rule only inspects
`className`, which is why `#6B7280` survives 42 times in props. Add selectors for hex
in any JSX attribute, off-palette hues, stock shadows and raw status colours — then
promote the existing four rules from `warn` to `error` once the sweeps land.

---

## 9. What was changed in this pass

Branding + sign-in refresh only. Everything else above is reported, not actioned.

- **"EOS Management Dashboard" → "Management Dashboard"** across `login`,
  `forgot-password`, `reset-password`, `layout.tsx` metadata (title and
  description) and `public/manifest.webmanifest`. No occurrences remain.
- **`AuthBackdrop`** (`src/components/layout/AuthBackdrop.tsx`) — a shared dawn-sky
  shell replacing the `from-[#001824] via-[#003344] to-[#0A5E7E]` gradient that was
  hardcoded in nine files. Driven by new `--color-auth-*` tokens.
- **`SunMark`** — the ray geometry from the brand mark (the same path that sits above
  the "A" in `logo-icon.svg`), inlined so `currentColor` resolves. Used once per auth
  page, small, crisp and fully saturated, as a divider under the wordmark.
- **Card** — cream (`--color-cream-soft`) rather than pure white, warm shadow, token
  radius, and a single accent rule along the top edge.
- **Removed three copies of a dead `<style jsx>` block.** The auth pages animated via
  inline `style={{ animation: "fade-in-up …" }}` against keyframes defined in a
  styled-jsx block — which scopes keyframe names, so the raw name in an inline style
  never matched. Those animations had never run. Now on the house
  `animate-slide-up` / `animate-scale-in` utilities, which use fill `backwards` per
  the containing-block rule in `globals.css`.
- **Contrast** — auth footer `text-white/30` → `/55`, subtitle `/50` → `/70`.

**A design decision worth recording**: the obvious move was a large brand sun floating
behind the sign-in card. It was tried at several sizes, opacities and blend modes and
never worked — the ray fan is wide and low-contrast, so at any size big enough to read
it pokes out either side of the card and looks like foliage, and screen-blending yellow
over a blue-teal sky lands on pale olive, not gold. The sky now carries the light
(a warm amber horizon glow, deliberately amber rather than accent yellow so the base is
warm) and the mark appears once, small and fully saturated. One confident use beats a
big faint one.

**Verified**: all three auth pages return HTTP 200 with the mark present and no SSR
errors; typecheck clean for `src/app` + `src/components`; ESLint clean on the touched
files; checked at 375px and desktop.

**Incidental find**: local dev was broken before this pass — Turbopack could not resolve
`next-auth`, `@vercel/speed-insights` or `tailwindcss` despite all three being installed.
Cause was a corrupt **16 GB** `.next` cache. Cleared; dev server healthy. Worth a
periodic `rm -rf .next` if it recurs.

---

## 10. Fix log — 2026-09-25 (branch `fix/verified-audit-defects`)

### Verified defects (§2)

| # | Defect | Fix |
|---|---|---|
| 2.1 | Activity-library uploads written to the serverless filesystem | Route now records Blob metadata only, validated by `safeAttachmentUrl` (Blob host allow-list) + `UPLOAD_ALLOWED_MIMES`; the hook calls `uploadFileSmart` first. `ApiError` + `parseJsonBody` per house standard. |
| 2.2 | Careers resume silently 413s | New `INLINE_BASE64_MAX_UPLOAD` (2.5 MB raw → ~3.4 MB encoded, under the 4 MB cap) shared by form and route, `describeInlineOversizeError` for an honest message, plus an explicit 413 branch because the edge returns HTML not JSON. Label now states the limit. |
| 2.3 | `ADMIN_ROLES` applied to 15%; `eos` stranded | Swept **250 call sites across ~220 files** onto `[...ADMIN_ROLES]` / `isAdminRole()`; removed 21 local shadow declarations. Adoption went **38 → 281 files**, hardcoded copies **212 → 1** (one deliberate exception: an ambassador workflow transition rule). New `ADMIN_ROLES_WITH_EOS` applied to `/api/audit-log` + `/api/data-room`, the two confirmed page-grants-but-API-403s. Guard test added. |
| 2.4 | `/staff`, `/wgea-report`, `/diversity-dashboard` unreachable stubs | Registered in `allPages` alongside the documented `/tools/*` stubs, so middleware lets the redirect fire. |
| 2.5 | ~~`/api/queue/all` ungated~~ | **Retracted — the finding was wrong.** See §2.5. |
| 7.1 | `/waitlist` invisible to every role | Added to `allPages` + `member`'s list; nav `roles` narrowed to mirror the API (owner/head_office/admin/member) so `staff`/`eos` no longer get a link that 403s. |
| 7.2 | ~30 pages with no edge auth | Matcher inverted to a deny-list with segment-anchored exclusions. Verified: 9 protected routes now redirect, 10 public routes still 200, and the `/learn`, print, `/a/[code]` and token-page edge cases all behave. |
| — | Dead `allPages` entry | `/roll-call` removed (page deleted 2026-04-29). |

### Reachability — "built well, nobody can find it"

- **`/safe-report`** — had zero inbound links anywhere. Now a permanent, role-independent
  link in the sidebar footer ("Raise a concern anonymously"), opening in a new tab so the
  reporter's current page stays out of the trail behind them.
- **`/notifications`** — the bell popover was a capped scroll list with no way through.
  Added a "View all notifications" footer link.
- **`/careers/[id]`** — the recruiter UI only ever named the external marketing site.
  Added "Preview the apply page" to `VacancyDetailPanel`, shown when the role is
  actually published to the website.
- **`/waitlist`, `/crm/templates`, `/help-centre`** — now linked from `/enrolments`,
  `/crm` and `/contact-centre` respectively.

### Broken links fixed
- `/marketing/qr-codes` now forwards `activationId`/`id` through its redirect, so
  activation-scoped QR deep links land scoped.
- `slack-webhook.ts` stopped emitting `/admin/feedback?id=` (a param the redirect drops
  and nothing downstream reads) and points at `/feedback?tab=internal`.
- `compliance/registers` Reg 146/147 placeholders now link to `/documents`.

### Branding
"EOS Dashboard" / "EOS Management Dashboard" removed from all user-visible copy —
login/forgot/reset, page metadata, PWA manifest, sidebar, adoption email, cron digest
footers and subject, policy + training compliance email footers, transcript PDF footer,
account-created email, and the KB/onboarding seed content. Code comments recording the
2026-07-30 parent-branding decision are left intact as history.

### Cross-links added

| From | To | Why |
|---|---|---|
| Notification bell popover | `/notifications` | the bell was a dead-end scroll list |
| Sidebar footer (all roles) | `/safe-report` | anonymous channel with zero inbound links |
| `VacancyDetailPanel` | `/careers/[id]` | recruiters had no way to share the apply page |
| `/crm` | `/crm/templates` | templates drive the pipeline shown on the page |
| `/contact-centre` (Tickets) | `/help-centre` | help-centre tickets land in this queue; admin-gated |
| `/enrolments` | `/waitlist` | a waitlist entry *is* an enquiry at stage `waitlisted` |
| `/billing/aged-debtors` row | `/financials/family-balances?search=` | who owes → the chase log |
| `/financials/family-balances` | `/billing/aged-debtors` | and back again |
| `/billing` | aged-debtors + family-balances | it linked nowhere; admin-gated |
| `/timesheets` | `/roster` | timesheets are downstream of published shifts |
| Activity-library picker | `/activity-library` | the modal had no "manage library" escape |
| Org chart seats | `/staff/[id]` | gated on `canAccessPage`, only when a seat is filled |
| Scorecard owner / centre | `/staff/[id]`, `/services/[id]` | drill into a red cell |
| Leadership rocks rollup | `/services/[id]` | same |
| Staff profile next shift | `/roster/me?userId=` | the param already existed |
| `StaffDashboard`, `LeaveTab` | `/my-leave` (was `/leave`) | they pointed at the deprecated page its own banner redirects away from |
| `KiosksPanel` | `/kiosk` | the setup flow couldn't open what it configures |
| `compliance/registers` | `/documents` | placeholders said "use the documents library", with no link |
| Parent child Info tab | `…/all-about-me` | a 9/10 page with zero entry points; staff read this data on the roll-call |
| `ParentShell` action items | `/parent/enrolments` | its only link was inside a widget that hides itself when empty |
| `MobileTabBar` "More" | unread count badge | staff had no at-a-glance unread signal on mobile |

### Dead code removed
- `/parent/getting-started` — superseded by `AddToPhoneCard`, zero inbound links.
- `BookingsV2.tsx` (599), `MessagesV2.tsx` (330), `ThreadV2.tsx`, and `useV2Flag` itself
  plus its test. `NEXT_PUBLIC_PARENT_PORTAL_V2` was never set in production, so none of
  it had ever rendered for a family while every change had to be made twice. The four
  E2E tests that exercised V2-only UI were removed with the code they covered.
- `/settings/seed` "OSHC Policies" tile — posted to `/api/policies/seed`, which does not exist.

### Found while fixing — NOT actioned, needs a decision

**`/services/[id]/booking-requests` would corrupt booking data if anyone reached it.**
It is orphaned (zero inbound links) and duplicates `/bookings`, but the two pipelines
disagree on a meaningful enum value:

- legacy `api/services/[id]/booking-requests/route.ts:92` accepts `"cancelled"` for a
  staff rejection and writes it straight through;
- canonical `api/bookings/[id]/decline/route.ts:43-46` writes `"declined"` plus
  `reviewedById`, `reviewedAt` and `declineReason`, and sends the decline notification.

`BookingStatus` treats `declined` and `cancelled` as distinct states — a staff decline
versus a family cancellation. So the orphaned page records rejections as cancellations
and drops the review audit trail. Harmless only because nothing links to it. Recommend
deleting the page and its route rather than wiring it in as a tab — but note that
`member` is absent from `/bookings` in `rolePageAccess` while that API's `minRole` is
`member`, so close that gap first or Directors of Service lose the surface entirely.

### Verification
`npm run build` exit 0 (739 static pages) · `npx vitest run` 640 files, 6,820 passed,
3 skipped, **0 failures** · `npm run lint` **0 errors** (warnings 1130 → 1121) ·
`tsc --noEmit` 0 source errors. Middleware behaviour checked live against 19 routes
covering protected pages, public pages, print views, the LMS player, `/a/[code]` and
token landing pages.
