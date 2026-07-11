# Amana OSHC EOS Dashboard

## Project Overview
- **Product**: EOS (Entrepreneurial Operating System) management dashboard for Amana OSHC (Out of School Hours Care)
- **Stack**: Next.js 16, TypeScript, Prisma ORM 5.22, PostgreSQL, Tailwind CSS, Vercel
- **Auth**: NextAuth.js with credential-based login
- **Email**: Resend API with branded HTML templates
- **State**: React Query (TanStack Query) for server state
- **Markdown**: react-markdown + remark-gfm + rehype-sanitize (for report viewer)
- **PDF**: jsPDF (for branded report exports)

## Commands
- `npm run dev` — start dev server
- `npm run build` — production build (always verify after changes)
- `npm run lint` — ESLint check
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

## Key Conventions
- Prisma schema changes: use `npx prisma migrate dev` for tracked migrations, `npx prisma db push` for quick dev iteration
- Cron jobs: Bearer CRON_SECRET auth via `verifyCronSecret`, idempotency via `acquireCronLock`
- API key auth: `authenticateApiKey(req, scope)` with scope-based access (for dashboard-generated keys)
- **Cowork API auth**: `authenticateCowork(req)` from `@/app/api/_lib/auth` — Bearer token vs `COWORK_API_KEY` env var. ALL cowork routes use this pattern (not `authenticateApiKey`).
- Dashboard API auth: `withApiAuth(handler, options?)` from `@/lib/server-auth` — session-based wrapper with rate limiting, timeout, and role/feature authorization
- Nav config: centralized in `src/lib/nav-config.ts` with sections (Home, EOS, Operations, Growth, People, Admin)
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
- **Quarter strings**: `Rock.quarter` format is `"Q3-2026"` (hyphen). Always use `quarterLabel(date)` / `getCurrentQuarter()` from `@/lib/utils` — a hand-rolled space-separated variant silently matched zero rocks in health scores and the dashboard.

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
- **E2E**: Playwright (`playwright.config.ts`) — 34 tests across 7 files (requires test DB). Local runs require `.env.local` with `NEXTAUTH_URL=http://localhost:3000` (not the Vercel URL — the magic-link verify redirects off-host otherwise) and `PARENT_JWT_SECRET` set. `playwright.config.ts` has an inline `dotenv` loader so test helpers (which run out-of-process via Prisma) pick these up.
- **Test dir**: `src/__tests__/` with `api/` (route tests), `lib/` (utility tests)
- **Test helpers**: `src/__tests__/helpers/` — `prisma-mock.ts` (auto-mock with `$transaction` support), `auth-mock.ts` (`mockSession`/`mockNoSession`), `request.ts` (`createRequest`)
- **Route test coverage**: auth, users, services, todos, rocks, enquiries, webhooks, marketing, CRM, attendance, financials, enrolments, communication, timesheets, incidents, leave, contracts
- **Infrastructure tests**: ApiError, withApiHandler, withApiAuth, fetchApi, rate-limit, logger, pagination, encryption, scenario-engine, csv-export, budget-helpers, password-breach, email-suppression, file-validation, json-fields, cowork-auth, server-auth, user-active-cache
- **Mock pattern**: Use `mockImplementation` with input-based routing (not `mockResolvedValueOnce` chains). Call `_clearUserActiveCache()` in `beforeEach`.
