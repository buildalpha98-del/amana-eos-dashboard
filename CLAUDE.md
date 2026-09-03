# Amana OSHC EOS Dashboard

## Project Overview
- **Product**: EOS (Entrepreneurial Operating System) management dashboard for Amana OSHC (Out of School Hours Care)
- **Stack**: Next.js 16, TypeScript, Prisma ORM 5.22, PostgreSQL, Tailwind CSS, Vercel
- **Auth**: NextAuth.js with credential-based login
- **Email**: TWO providers by design — Brevo for marketing/campaign sends (`src/lib/brevo.ts`), Resend for transactional/assignment (`src/lib/email.ts`, branded HTML templates). Events: `/api/webhooks/resend` AND `/api/webhooks/brevo` (Phase 3, `?secret=` auth via `BREVO_WEBHOOK_SECRET`) both write `EmailEvent`; Brevo events correlate to sends via `DeliveryLog.externalIdType` (`brevo_message` <50-recipient sends matched on message-id; `brevo_campaign` ≥50 matched on camp_id) → `EmailEvent.deliveryLogId`. Suppression (`EmailSuppression`) is enforced at EVERY send path via `getSuppressedEmails()` (batch) — campaign send, recipient-count, and the Resend wrapper; the webhook auto-suppresses on bounce/spam/unsubscribe/block. Test-send: `POST /api/email/test-send` (self-only, "[Test] " prefix, rate-limited 5/min). Creative-request assignment emails BYPASS the `shouldReceiveNudge` leadership gate on purpose (work-queue notification; the gate excludes marketing-role users) — see `send-assignment-email.ts`.
- **State**: React Query (TanStack Query) for server state
- **Markdown**: react-markdown + remark-gfm + rehype-sanitize (for report viewer)
- **PDF**: jsPDF (for branded report exports)

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build (`prisma generate && next build`; always verify after changes). It deliberately does NOT run `prisma migrate deploy` — production migrations come from `vercel.json`'s `buildCommand`. Putting them in the npm script meant a local build pointed `migrate deploy` at the production DB, and broke CI's E2E job with P3005.
- `npm run lint` — ESLint check, scoped to `src` + `tests` (a bare `eslint .` also sweeps local-only generated dirs — `.claude/worktrees/`, `coverage/`, playwright artifacts — and reports tens of thousands of phantom errors). Zero-error state reached 2026-09-03 and enforced by the CI `lint` job (test.yml): errors fail the build, warnings (unused-vars, design-token rails, exhaustive-deps) are visible but non-blocking — don't add new errors. `@typescript-eslint/no-explicit-any` is warn-only in `src/__tests__`/`tests`/`scripts`/`prisma`, error in production code.
- `npm test` — run Vitest unit tests
- `npm run test:integration` — integration tests
- `npm run test:e2e` — Playwright end-to-end tests
- `npx prisma migrate dev` — create and apply schema migrations (preferred)
- `npx prisma db push` — apply schema changes without migration (quick dev only)
- `npx prisma db seed` — seed database
- `npx prisma studio` — open Prisma data browser

## Environment
- Copy `.env.example` to `.env.local` and fill in required values
- Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`
- **Databases (2026-09-01)**: `DATABASE_URL` in `.env.local` is the LOCAL dev
  database (`postgresql://…@localhost:5432/amana_eos_dev`, Homebrew
  postgresql@17; schema via `npx prisma db push`, data via `npx prisma db seed`).
  Production (Neon) lives in `PROD_DATABASE_URL`/`PROD_DATABASE_URL_UNPOOLED`
  and must be exported EXPLICITLY per command — nothing may touch prod by
  default. This ended the standing landmine behind the 2026-07-07 prod wipe
  and the 2026-08-31 P3009 deploy blockage. E2E keeps its own
  `amana_eos_test` via `.env.test`.

## Key Conventions
- Prisma schema changes: use `npx prisma migrate dev` for tracked migrations, `npx prisma db push` for quick dev iteration
- Cron jobs: Bearer CRON_SECRET auth via `verifyCronSecret`, idempotency via `acquireCronLock`
- API key auth: `authenticateApiKey(req, scope)` with scope-based access (for dashboard-generated keys)
- **Cowork API auth**: `authenticateCowork(req)` from `@/app/api/_lib/auth` — Bearer token vs `COWORK_API_KEY` env var. ALL cowork routes use this pattern (not `authenticateApiKey`).
- Dashboard API auth: `withApiAuth(handler, options?)` from `@/lib/server-auth` — session-based wrapper with rate limiting, timeout, and role/feature authorization
- Nav config: centralized in `src/lib/nav-config.ts` with sections (Home, EOS, Operations, Growth, People, Admin, Settings). Keep each section's items contiguous — the sidebar renders one header per section name (Marketing items live inside Growth as of 2026-07-12)
- **Curated sidebar** (2026-07-12): every nav item has a `core` tier — `true` (always visible), `Role[]` (visible by default for those roles; owner matches all), or omitted (behind the section's "+N more" toggle). The active page and badge-carrying items always surface; sections with ≤2 items skip curation. When adding a nav item, decide its tier — omitting `core` is a deliberate "overflow" choice, not a default to skip.
- Email templates: inline styles in `src/lib/email-templates.ts`, use `baseLayout()` wrapper and `buttonHtml()` for CTAs
- Vercel cron config in `vercel.json`
- Build command: `npm run build` — always verify after changes
- Toast system: `toast({ description: "..." })` — `description` is required, not optional

## Design System (2026-07-11)
- **Tokens only**: colors come from `src/app/globals.css` `@theme` — `text-foreground`/`text-muted`/`bg-card`/`bg-surface`/`bg-brand`/`border-border` etc. Never raw Tailwind grays, `bg-white`, or hex-in-className (ESLint warns via `design-token-rails`; `src/components/charts/` is exempt for Recharts). Translucent overlays on dark surfaces (`bg-white/10`) are fine.
- **`@theme` vs `@theme inline`**: colors/radii/shadows MUST live in plain `@theme` (a guard test enforces this). `inline` freezes utilities to literal values and silently breaks the `.dark { --color-* }` overrides and `[data-v2="staff"]` density overrides. Only the font tokens (which reference next/font vars) belong in `@theme inline`.
- **Dark mode**: driven by the `.dark` class on `<html>` + token overrides; `@custom-variant dark` is registered so `dark:` variants follow the app toggle, not the OS. For hardcoded tinted surfaces (amber banners, status-tinted rows), pair light classes with `dark:` variants (`bg-amber-50 dark:bg-amber-950/40`).
- **Buttons**: action buttons (primary/secondary/outline/ghost/destructive) use `Button` from `@/components/ui/Button` — never hand-roll `bg-brand text-white` / `bg-red-600` buttons. Tabs, sort headers, chips, and card-as-button wrappers stay raw, but icon-only buttons MUST have `aria-label`.
- **Page headers**: use `PageHeader` from `@/components/layout/PageHeader`; when it can't fit, canonical title classes are `text-xl font-heading font-semibold tracking-tight text-foreground` with `text-sm text-muted mt-1` description.
- **Micro text**: `text-2xs` (10px token) for badge/meta text — no arbitrary `text-[Npx]`.
- **Quarter strings (FINANCIAL YEAR as of 2026-07-28)**: EOS quarters follow the Australian FY (1 Jul – 30 Jun), NOT the calendar year. `Rock.quarter` format is `"Q1-FY27"` — Q1=Jul–Sep, Q2=Oct–Dec, Q3=Jan–Mar, Q4=Apr–Jun, with the FY named by its ENDING year. Always use `quarterLabel(date)` / `getCurrentQuarter()` / `shiftQuarter()` / `quarterDateRange()` / `compareQuartersDesc()` from `@/lib/utils`. Never hand-roll a quarter string or parse one with `.split("-")` + `Number()` — `Number("FY27")` is `NaN`, and hand-rolled variants have twice silently matched ZERO rocks (once via a space-separated `"Q3 2026"` in the L10 digest cron, once via calendar labels after the FY switch). `quarterDateRange()` exists because Q1 starts in JULY, so `(q-1)*3` month maths is wrong. Legacy calendar labels were migrated 1:1 by `20260728100000_rock_quarter_financial_year`; `calendarQuarterToFinancial()` implements the same remap if stale data resurfaces.

## Important Paths
- `prisma/schema.prisma` — database schema
- `src/lib/auth.ts` — NextAuth config
- `src/lib/prisma.ts` — Prisma client singleton
- `src/lib/email-templates.ts` — all transactional email HTML templates (40+ hardcoded)
- `src/lib/email-marketing-layout.ts` — marketing email layout, block rendering, `EmailLayoutOptions` for header/footer customization
- `src/lib/nav-config.ts` — sidebar navigation structure
- `src/lib/api-key-auth.ts` — API key scopes and authentication (dashboard keys)
- `src/lib/server-auth.ts` — `withApiAuth()` wrapper for session-based dashboard API routes (rate limiting, timeout, auth logging)
- `src/lib/api-error.ts` — `ApiError` class, `parseJsonBody()` safe JSON parser
- `src/lib/api-handler.ts` — `withApiHandler()` wrapper for unauthenticated routes (cowork, webhooks, public)
- `src/lib/fetch-api.ts` — `fetchApi()` / `mutateApi()` client-side fetch wrappers with error context, timeout, retry
- `src/lib/rate-limit.ts` — rate limiting (Upstash Redis in prod, in-memory fallback in dev)
- `src/lib/logger.ts` — structured logger with request ID correlation
- `src/lib/nurture-scheduler.ts` — schedules nurture steps on enquiry stage change (dual system: legacy ParentNurtureStep + new SequenceEnrolment)
- `src/lib/crm/schedule-sequence.ts` — CRM outreach sequence trigger on lead stage change
- `src/app/api/_lib/auth.ts` — `authenticateCowork()` for all cowork routes
- `src/app/api/cowork/_lib/resolve-assignee.ts` — assignee resolution (named, pipe-separated, role-based)
- `src/app/(dashboard)/settings/SettingsContent.tsx` — settings UI including API scopes
- `src/components/queue/ReportViewer.tsx` — rich report viewer (markdown, checklists, PDF export)
- `src/components/email/EmailComposer.tsx` — block editor + HTML editor + live preview + header/footer settings
- `src/lib/report-pdf.ts` — branded Amana OSHC PDF generation
- `src/lib/enrolment-pdf.ts` — branded enrolment submission PDF
- `src/components/ui/Skeleton.tsx` — reusable skeleton loading component
- `src/lib/owna.ts` — OWNA childcare API client (x-api-key auth, NOT Bearer)
- `src/lib/onboarding-seed.ts` — auto-seeds 7 onboarding todos + welcome announcement on user creation
- `src/app/api/cron/owna-sync/route.ts` — syncs children, attendance, enquiries, incidents from OWNA
- `vercel.json` — cron schedules and build config

## Parent Help Centre (public /support)
- **Public portal** at `/support` (route group `(public)`, NO auth, deliberately absent from the middleware matcher): Freshdesk-style — search, category cards, article pages, submit-a-ticket. Server components read Prisma directly with `force-dynamic`; the client SearchBox uses `GET /api/public/help-centre/articles?search=`.
- **Models**: `HelpCategory` + `HelpArticle` — separate from `KnowledgeBaseArticle` (staff `/help`) so parent and staff content never mix. Only `published` rows in `published` categories are publicly visible.
- **Tickets**: `POST /api/public/help-centre/tickets` creates a `SupportTicket` (`source: "portal"`, tag `help-centre`) via a stub `WhatsAppContact` (`waId: "help-<email>"`) — lands in the contact-centre queue. IP rate limit 5/15min + honeypot (same pattern as `/api/public/enquiries`).
- **Admin** at `/help-centre` (owner/head_office/admin, Growth nav): category/article CRUD via `/api/help-centre/*`, markdown write/preview. Hooks in `src/hooks/useHelpCentre.ts`; slug helpers in `src/lib/help-centre.ts`.
- **Seed**: `prisma/seed-help-centre.ts` (idempotent, runs on every deploy) — articles only seed when a category has NONE, so admin edits survive redeploys. Content edits belong in the dashboard, not the seed.

## Services Section Architecture
- **Detail page**: `src/app/(dashboard)/services/[id]/page.tsx` — 6 grouped tabs with sub-pill navigation, URL-synced via `?tab=&sub=`
- **Tab components**: 19 files in `src/components/services/Service*.tsx`
- **Data layer**: `src/hooks/useServices.ts` — `useServices()`, `useService(id)` (5-min auto-refetch), CRUD mutations
- **API routes**: 22 endpoints under `/api/services/[id]/` + 1 at `/api/health-scores/[serviceId]/`
- **Cowork ingest routes**: 6 endpoints at `/api/cowork/services/[serviceCode]/` — audits, checklists, comms, menus, programs, holiday-quest. These use `serviceCode` (not ID) and `authenticateCowork()` auth. External automations push data here.
- **Mobile breakpoint**: `sm:` (640px) — mobile on `sm:hidden`, desktop on `hidden sm:block`

## Automation System
- **Cowork API Key**: `amana_af69a9e6...` prefix, stored in `ApiKey` table with 37 scopes
- **Assignee Resolution**: 4 types — named ("daniel"), pipe-separated ("mirna|tracie"), role-based ("resolve:service-coordinator"), system
- **Queue System**: `/queue` page with My Queue / All Queues toggle (admin only)
- **Report Viewer**: slide-over panel with markdown rendering, interactive checklists, alerts, metrics, PDF export
- **Staff Sync**: `POST /api/cowork/staff/sync` for registry-based user upsert

## Creative Requests (Marketing Hub Phase 1, 2026-08-05)
- **What**: centre staff submit design briefs (poster, flyer, table cover…) at `/requests`; marketing works a staged queue. Pipeline: `new → briefed → in_progress → in_review → changes_requested → approved → delivered` (+`cancelled`) — transitions validated server-side via `TRANSITIONS` in `src/lib/creative-request/constants.ts`.
- **Lib**: `src/lib/creative-request/` — `request-number.ts` (REQ-YYYY-NNNN + P2002 retry), `constants.ts` (transitions, per-type turnaround, `isFulfillerRole`, business-day maths), `notify.ts` (in-app fan-out, swallow-on-error), `include.ts` (shared Prisma include — attachments filtered to `messageId: null` so internal-message files never leak via list/detail), `attachment-schema.ts` (Zod, `safeAttachmentUrl` Blob-host allowlist — NEVER accept raw URLs).
- **API**: `/api/creative-requests` (list role-scoped: fulfiller roles marketing/owner/head_office/admin see all, centre roles only their own; create open to all roles), `/[id]` (GET 404s non-participants — no existence leak; PATCH: fulfiller transitions/assign, requester may only cancel while new/briefed), `/[id]/messages` (internal notes filtered at the QUERY level for requesters; `internal` flag forced false for non-fulfillers).
- **UI**: `/requests` is role-adaptive — kanban board (fulfillers) vs "My requests" + intake modal (centre roles). Type picker sets default due date from `TURNAROUND_BUSINESS_DAYS`.
- **Uploads** go through the existing `/api/upload` (Vercel Blob) and URLs are validated against the Blob host on every write path.
- **Audiences (Phase 4)**: `EmailAudience` stores RULES (Json), never frozen lists — validated by `audienceRulesSchema` (src/lib/audience-rules.ts, strict zod, field-whitelisted) and compiled to a `CentreContactWhereInput` by ONE shared path (`compileAudienceWhere`/`resolveAudienceWhere` + `countAudienceRecipients` in audience-count.ts) used by send, recipient-count, CRUD and preview-count — never hand-roll a recipient `where`. Engagement conditions resolve via EmailEvent. Archive-only deletes.
- **Per-recipient sends (Phase 4)**: <50-recipient (and enquiry) sends dispatch ONE Brevo call per recipient with `tags: ["dl:<deliveryLogId>"]` — the DeliveryLog row is PRE-created (`status: sending`, `externalIdType: brevo_message_per_recipient`) and updated to `sent/scheduled/partial/failed`; the webhook correlates tag-first (PK-validated). The ≥50 campaign path is unchanged. Partial failures record `payload._failedRecipients`.
- **Per-send reports (Phase 4)**: `GET /api/email/reports/[deliveryLogId]` + `SendReportPanel` (opened from analytics recent sends). Conventions: rates = unique events / post-suppression recipientCount; hourly curve excludes events past 24h (totals include them); per-link numbers are "recipients whose FIRST click was this link" (webhook dedupe collapses later clicks) — keep labels honest.
- **Campaign umbrella (Phase 4)**: `CreativeRequest.campaignId` (fulfiller-set) + direct campaign sends stamp `DeliveryLog.entityType="MarketingCampaign"`. Post sends keep `entityType="MarketingPost"` and attribute to campaigns TRANSITIVELY via post.campaignId — never stamp both (zod refine enforces at-most-one of enquiryId/postId/marketingCampaignId). Campaign detail GET returns `creativeRequests` + `emailSends` for the Assets section.
- **Attribution (Phase 5)**: `src/lib/campaign-attribution.ts` owns EVERY funnel query — window resolution (nullable campaign dates fall back to createdAt/now, clamped), attributed vs CONTEXTUAL counts (attributed = traced via `sourceActivation`/QR/tracked email; contextual = window+linked-services counts — never present contextual as attributed). Surfaced at `GET /api/marketing/campaigns/[id]/performance` + the panel's Performance section. Enrolments count `ParentEnquiryStageEvent` `toStage:"enrolled"` — EVERY stage write must go through `logEnquiryStageEvent` (ALL writers compliant as of 2026-08-08 — dashboard routes, cowork pipeline/stage, OWNA sync, VAPI, auto-cold cron; keep it that way for any new stage writer).
- **CSAT + guardrails (Phase 6)**: `CreativeRequestSatisfaction` — one 👍/👎 per delivered request, REQUESTER-only voice via `POST /api/creative-requests/[id]/satisfaction` (own endpoint — delivered is terminal and PATCH-locked); aggregates at `GET /api/marketing/creative-request-quality` (first-proof rate counts plain approvals ONLY; `approved_with_changes` stays denominator-only). **Frequency cap**: `MarketingSendRecipient` ledger — ALWAYS write via `recordMarketingSends()` (swallow-and-log; sources campaign/cowork/nurture/resend; test-send deliberately excluded), enforced by `getFrequencyCapped()` (3/rolling-7d) on BULK sends only (campaign + cowork; nurture/enquiry are recorded but never blocked); cowork sends are now suppression-filtered too (deliberate Phase 6 change); janitor prunes ledger rows >30d. **Cancel**: `POST /api/email/scheduled/[id]/cancel` — findUnique-first (legacy null externalIdType → 409), conditional claim `scheduled→cancelled`, then Brevo best-effort per type (`_sentMessageIds` captured on <50 sends for per-message cancel); local truth beats Brevo. **Re-send**: `POST /api/email/reports/[id]/resend` — partial rows only, suppression re-checked, cap NOT consulted, NEW DeliveryLog row cross-linked via `_resendOfDeliveryLogId`/`_resendDeliveryLogId` (double-retry 409s once stamped). Per-recipient dispatch machinery lives in `src/lib/email-dispatch.ts` (shared by send + resend).
- **Email layout + send honesty (Phase 7)**: `marketingLayout` escapes ALL header/footer option interpolations (content stays pre-rendered HTML — deliberately unescaped); every server render site passes the org-branding layoutOpts (campaign send, test-send, preview, nurture-send — block-mode emails are branded, not bare). User layout overrides validated by `layoutOptionsSchema` (`src/lib/email-layout-schema.ts` — strict, 6-digit hex colour, Blob-only logo, https-only footerUrl) and merged `{...branding, ...overrides}` in the three composer routes. The composer sends ONLY touched fields (`pickTouchedLayoutOptions` + `touchedLayoutKeys` in the draft) so untouched fields keep tracking live org branding — NEVER ship the full seeded object (it freezes branding at seed values). Composer seeds from the `branding` slice on `GET /api/org-settings/config` (same `getEmailBranding()` source as the send routes; the role-gated `/api/org-settings` GET is unreadable to marketing users). **Scheduled→sent sync**: the Brevo webhook flips `scheduled` DeliveryLogs to `sent`+`sentAt` on the first `delivered` event via a status-guarded `updateMany` (`where: { id, status: "scheduled" }` — the guard IS the cancel-race protection; sits BEFORE the event-dedupe early-return so duplicates re-fire it as a harmless no-op). Cowork immediate sends stamp `sentAt` at dispatch; scheduled ones leave it for the webhook. **Configurable cap**: `email.marketingWeeklyCap` in org settings (int 1–20, default 3, editable in Settings → Organisation); `getFrequencyCapped(db, emails, { cap?, now? })` — the lib never reads org settings, callers resolve via `getOrgSettings()` (60s cache staleness accepted). **Lifecycle ledger**: waitlist confirmation (enquiries/[id] stage→waitlisted), enrol send-link, families remind, and touchpoint-scheduler record `source: "lifecycle"` via `recordMarketingSends()` — recorded for cap visibility, NEVER blocked.
- **Marketing crons (Phase 5)**: `email-janitor` (daily — strands `sending`>1h → failed; deletes Brevo temp lists via `payload._brevoListId` + legacy `delivery-<epoch>` sweep; never touches lists of `scheduled` sends), `marketing-measurables` (Sun 20:45 UTC — auto-feeds Scorecard measurables by NARROW title substrings: "creative request"/"design request" on-time %, "…turnaround", "email open", "qr scan", "marketing enquir"; `weekOf` must stay byte-identical to auto-measurables'), `term-autopilot` (Mon 21:00 UTC — creates each active centre's pack 4wk before term start via `src/lib/term-pack.ts`; per-service idempotency marker `[auto:term-pack:<year>-T<term>]` in purpose; ONE digest notification; term dates from `@/lib/school-terms` ONLY — never the term-calendar route's month-index duplicate). `DeliveryLog.sentAt` = dispatch completion (null for scheduled/failed).
- **Proofing loop (Phase 2)**: `CreativeRequestProof` — versioned per request, three-state decisions (`approved` / `approved_with_changes` / `changes_requested`, notes required for the latter two) via `/api/creative-requests/[id]/proofs` (+`/[proofId]/decision`). Proof upload auto-transitions to `in_review` (the ONLY way in — manual PATCH to `in_review` 409s); decisions drive status via `DECISION_TO_STATUS`. Only the LATEST undecided proof is decidable; superseded proofs stay as history.
- **Pause clock**: `pausedAt`/`pausedMs` on `CreativeRequest` — the turnaround clock stops while `in_review` (waiting on the requester). ALL status writes go through `applyStatusChange()` in `src/lib/creative-request/status-change.ts` (stamps stage timestamps + banks pause time, Int32-clamped); never set `status` on a request inline. UI shows `effectiveDueDate()` = dueDate + banked/live pause.
- **Checklists**: `CreativeRequest.checklist` Json (`[{label, done}]`), seeded from `DEFAULT_CHECKLISTS[type]` at create, fulfiller-only to edit.

## Staff Induction & Training LMS (hard-gated)
- **Gate is the point**: a new starter cannot be rostered or clock in until essential training is complete AND (for genuine new hires) a State Manager/Admin signs off their week-1 practical. Single source of truth: `src/lib/induction.ts` — `assertUserCleared(userId)` (throws `ApiError.forbidden`), `getInductionReadiness(userId)`, `recomputeInductionState`, `onModuleProgressed`. Pure edge-safe helpers (for middleware) in `src/lib/induction-lock.ts`.
- **Enforced at 7 surfaces**: roster shift create (`roster/shifts` POST) + reassign (`roster/shifts/[id]` PATCH) + open-shift claim, and all clock-ins: per-shift, auto, unscheduled, and kiosk. Each calls `assertUserCleared`.
- **State machine** on `User.inductionStatus` (`InductionStatus` enum): `new_starter → in_training → awaiting_signoff → cleared`. Migration default is `cleared` so deploy is a no-op. `inductionGraceUntil` (backfill grace), `inductionOverrideUntil` (audited admin override), `inductionDueDate`, `inductionClearedAt/ById`.
- **Locked-mode**: while `new_starter`/`in_training`-without-grace, middleware + Sidebar restrict the user to `/my-training`, `/learn`, `/profile`, `/handbook`, `/policies`, `/compliance`. Per-USER via JWT (`inductionStatus`/`inductionGraceUntil` on token, refreshed on the 5-min tokenVersion cadence) — NOT the per-role page-override system, and NOT a new Role enum value. ~5-min UI-lock lag is expected; the gate APIs read the DB live so clock-in is never stale.
- **Quiz engine**: `src/lib/quiz.ts` — deterministic seeded shuffle + server-side scoring (80% pass). Correct answers never sent to the client; the client submits DISPLAY indices mapped back via the per-attempt permutation (seed = enrollmentId+moduleId+attemptNumber). API: `GET/POST /api/lms/modules/[moduleId]/quiz` (start/submit — GET reuses an unsubmitted attempt rather than minting rows). Admin CRUD: `/api/lms/quiz-questions`. `LMSQuizQuestion` + `LMSQuizAttempt` (submittedAt marks in-progress vs submitted; `optionsFingerprint` is recorded at start and submit 409s if the question set changed mid-attempt). The submit payload carries exactly ONE answer index — `explanations[].correctIndex`, in DISPLAY space; never add a canonical-space index alongside it (that ambiguity caused the PR #202 bug).
- **Enrollment recompute**: `recalcEnrollmentStatus(enrollmentId)` in `src/lib/lms-progress.ts` is the ONLY place enrollment status is derived from module progress — used by quiz submit, `/api/lms/module-progress`, and `/api/lms/enrollments` progress mode. On completion it also writes `LMSEnrollment.score` (average of scored module progress) for the transcript PDF; don't reimplement this inline in routes.
- **Immersive player**: `/learn/[enrollmentId]` (route group OUTSIDE `(dashboard)`, opens in a new tab, no sidebar). Gated click-through — 60s dwell floor for reading modules, quiz-pass for quiz modules (`src/lib/course-player.ts`). Admins opening another learner's enrollment get a read-only preview (banner, free navigation, no auto-completion, no quiz attempts) — the write paths belong to the enrolled learner only. Rich media via a PLAYER-SCOPED sanitizer (`src/lib/lms-sanitize-schema.ts`): `<img>` Blob-host only, `<iframe>` YouTube/Loom/Vimeo only. NEVER apply this schema to ReportViewer/AiDraftReviewPanel/FloatingChatWidget (they keep the bare default).
- **Learner hub**: `/my-training` (Home nav, all roles). Admin surface: `/onboarding` → "Induction" tab (`InductionAdminTab`) — pipeline board, practical sign-off queue (signers = `head_office`/`admin`/`owner` only, no self-sign-off), annual training-calendar editor, backfill launcher.
- **Exempt roles** (`INDUCTION_EXEMPT_ROLES` in `src/lib/induction-lock.ts`): `owner`, `head_office`, `admin` (they administer the gate — locking them out deadlocks it) and `marketing` (no child-facing duties). The list governs locked-mode AND both auto-enrolment paths (`/api/induction/backfill`, `/api/cron/training-monthly`) — an exempt role enrolled by a cron would just be re-locked next sweep. `isInductionLocked(status, grace, { role, now })` takes an options object; `role` must be passed at every call site.
- **Gate satisfiability is a hard invariant**: every blocker in `getInductionReadiness` must have a `href` pointing at a page the LOCKED user can reach AND that can actually resolve the blocker. Broken twice on 2026-08-25 — the WWCC blocker linked to `/profile`, which had no cert uploader (the uploader is on `/compliance`, which locked users were redirected away from), and the profile blocker demanded an emergency contact that only the admin `/staff/[id]` tab could add. Result: 0 of 82 staff could ever clear. `/profile` now carries both (`MyCertificatesSection`, `EmergencyContactsSection`). Before adding a blocker, verify a locked staff member can self-serve it end to end.
- **New-starter creation**: `POST /api/users` accepts `newStarter: true` + `startDate` → `inductionStatus: new_starter`. Default creation stays `cleared`.
- **Backfill**: `POST /api/induction/backfill` (owner/head_office) — enrols active cleared staff missing the essential track into it, `in_training` + 5-week (`35d`) grace. Idempotent; no-op if no essentials published.
- **Crons**: `/api/cron/training-monthly` (1st of month, enrols cleared users in that month's `TrainingCalendarSlot` courses, `"0 22 1 * *"`) and `/api/cron/induction-grace` (daily, expires grace windows, `"0 20 * * *"`).
- **Seed**: `prisma/seed-induction.ts` (called from `prisma/seed.ts`, idempotent) — 7 essential + 12 monthly courses as DRAFTS with placeholder content, 6 practical checklist items, 12 calendar slots. **Content is placeholder — real curriculum authored separately. Gate only counts `status: published` essential courses, so it stays inert until courses are published.**
- **Rollout**: (1) merge = no-op, all `cleared`; (2) publish essential courses one by one; (3) launch backfill; (4) grace expiry gates stragglers; (5) new hires use the "New starter" flag. Course track: `LMSCourse.track` = `essential | monthly | library`.

## File Uploads
- **Always use `uploadFileSmart(file)` from `@/lib/upload-client`** — never a raw `fetch("/api/upload")`. It downscales photos in-browser, then routes by size.
- **Why**: Vercel rejects a serverless request body over ~4.5MB at the edge, before the route runs. `/api/upload` advertised 10MB, so everything in the gap came back as a bare `413` with no server log. This made the staff WWCC uploader unusable and was a direct cause of the 2026-08-25 induction lockout.
- **Routing**: `<= SERVERLESS_BODY_LIMIT` (4MB) → `/api/upload` (magic-byte sniffed server-side). Above it → direct PUT to Vercel Blob via `/api/upload/blob-token`, then `/api/upload/verify` range-reads the stored object, re-runs `validateFileContent`, and **deletes the blob** if the bytes contradict the declared type. Never persist a direct-upload URL before verify returns ok.
- **Shared constants** live in `src/lib/upload-strategy.ts` (`UPLOAD_ALLOWED_MIMES`, `SERVERLESS_BODY_LIMIT`, `ABSOLUTE_MAX_UPLOAD`). Adding a MIME there means also adding its magic-byte signature to `detectFileType` in `src/lib/file-validation.ts`, or the type is accepted by the allow-list and then rejected by the sniffer.

## API Versioning (Cowork)
- **Strategy**: URL path versioning (`/api/cowork/v2/...`) for breaking changes only
- **Current versions**: v1 (implicit, `/api/cowork/...`), v2 (`/api/cowork/v2/announcements` only)
- **Version header**: All cowork responses include `X-API-Version: 1` (or `2` for v2 routes). Clients can check this for compatibility.
- **When to create v2**: Only when a breaking change is needed (field removal, type change, response structure change). Additive changes (new optional fields) stay in v1.
- **Deprecation**: When v2 of a route exists, v1 responses include `X-API-Deprecated: true` and `Sunset` headers. Allow 90-day migration window before removing v1.
- **v2 conventions**: v2 routes use the canonical dashboard models (e.g., `Announcement` not `CoworkAnnouncement`), include activity logging, and resolve service by code.
- **New route checklist**: auth via `authenticateCowork()`, Zod validation, `withApiHandler()` wrapper, version header in response

## Rate Limiting
- **Authenticated routes** (`withApiAuth`): 60 req/min per user per endpoint. Override per-route: `withApiAuth(handler, { rateLimit: { max: 10, windowMs: 30000 } })`. Disable: `{ rateLimit: false }`.
- **Cowork routes** (`authenticateCowork`): 10 req/15min per IP for auth failures.
- **API key routes**: 100 req/min per key.
- **Login/password reset**: 5 attempts/15min per IP.
- **Backend**: Upstash Redis in production (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`). In-memory fallback when env vars not set (dev only).
- **Rate limit key format**: `auth:{userId}:{pathname}` — per-endpoint to prevent false 429s when dashboard loads multiple APIs in parallel.

## Auth Event Logging
- All auth rejection paths in `withApiAuth` log structured warnings via `logger.warn()`:
  - `Auth: no session` — unauthenticated request
  - `Auth: deactivated user` — user account disabled (includes userId)
  - `Auth: role denied` — role not in allowed list (includes role, required roles, endpoint)
  - `Auth: below minRole` — role below minimum required
  - `Auth: feature denied` — feature check failed
  - `Auth: rate limited` — rate limit exceeded (includes userId, endpoint, resetIn)
- Request IDs (`x-request-id` header) are set on all responses from `withApiAuth` and `withApiHandler` for log correlation.

## Error Handling
- **Server routes**: Throw `ApiError` from `@/lib/api-error` inside `withApiHandler()` or `withApiAuth()` wrappers. Errors are formatted as `{ error: string, details?: unknown }`.
- **JSON body parsing**: Use `parseJsonBody(req)` instead of raw `req.json()` — returns 400 on malformed JSON, not 500.
- **Client hooks**: All mutations use `onError` with `toast({ variant: "destructive", description: err.message })`. All queries use `retry: 2`.
- **Client fetch**: `fetchApi<T>(url)` and `mutateApi<T>(url, { method, body })` from `@/lib/fetch-api` — includes timeout (30s default), error context (status, URL, server message), content-type validation.

## Testing
- **Unit/Integration**: Vitest (`vitest.config.mts`, `vitest.integration.config.mts`) — 700+ tests across 46 files
- **E2E**: Playwright (`playwright.config.ts`) — ~130 tests across 14 files (requires test DB). Local runs require `.env.local` with `NEXTAUTH_URL=http://localhost:3000` (not the Vercel URL — the magic-link verify redirects off-host otherwise) and `PARENT_JWT_SECRET` set. `playwright.config.ts` has an inline `dotenv` loader so test helpers (which run out-of-process via Prisma) pick these up. Seed local test users with `seedTestData()` from `src/lib/test-utils/seed-test-data.ts` (same as CI).
- **E2E gotchas** (each one broke the 2026-09-02 nightly): (1) the welcome tour modal opens 1.5s after load for any context without `localStorage["amana-tour-completed"]` and silently blocks EVERY click — `auth.setup.ts` stamps the flag before saving storageState; any spec that logs in via the UI must stamp it too. (2) `getByText("X")` is substring + case-insensitive; page copy like subtitles routinely creates strict-mode violations — prefer `getByRole` or `.first()`, and remember `isVisible().catch(() => false)` turns a strict-mode throw into a silent false. (3) After clicking a client-side link, `waitForLoadState("networkidle")` resolves immediately — `waitForURL` before reading `page.url()`. (4) `request.newContext()` inside the runner inherits `test.use({ storageState })`; pass `storageState: { cookies: [], origins: [] }` when creating a session-minting context. (5) `/_vercel/speed-insights/script.js` 404s as HTML off-Vercel — it's in the smoke spec's ignore list, don't fail on it.
- **Test dir**: `src/__tests__/` with `api/` (route tests), `lib/` (utility tests)
- **Test helpers**: `src/__tests__/helpers/` — `prisma-mock.ts` (auto-mock with `$transaction` support), `auth-mock.ts` (`mockSession`/`mockNoSession`), `request.ts` (`createRequest`)
- **Route test coverage**: auth, users, services, todos, rocks, enquiries, webhooks, marketing, CRM, attendance, financials, enrolments, communication, timesheets, incidents, leave, contracts
- **Infrastructure tests**: ApiError, withApiHandler, withApiAuth, fetchApi, rate-limit, logger, pagination, encryption, scenario-engine, csv-export, budget-helpers, password-breach, email-suppression, file-validation, json-fields, cowork-auth, server-auth, user-active-cache
- **Mock pattern**: Use `mockImplementation` with input-based routing (not `mockResolvedValueOnce` chains). Call `_clearUserActiveCache()` in `beforeEach`.
