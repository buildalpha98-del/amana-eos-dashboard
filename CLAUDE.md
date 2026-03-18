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
- `npx prisma db push` — apply schema changes (not migrations)
- `npx prisma db seed` — seed database
- `npx prisma studio` — open Prisma data browser

## Environment
- Copy `.env.example` to `.env.local` and fill in required values
- Required: `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`

## Key Conventions
- Prisma schema changes: use `npx prisma db push` (not migrations)
- Cron jobs: Bearer CRON_SECRET auth via `verifyCronSecret`, idempotency via `acquireCronLock`
- API key auth: `authenticateApiKey(req, scope)` with scope-based access (for dashboard-generated keys)
- **Cowork API auth**: `authenticateCowork(req)` from `@/app/api/_lib/auth` — Bearer token vs `COWORK_API_KEY` env var. ALL cowork routes use this pattern (not `authenticateApiKey`).
- Dashboard API auth: `requireAuth()` from `@/lib/server-auth` — session-based for browser requests
- Nav config: centralized in `src/lib/nav-config.ts` with sections (Home, EOS, Operations, Growth, People, Admin)
- Email templates: inline styles in `src/lib/email-templates.ts`, use `baseLayout()` wrapper and `buttonHtml()` for CTAs
- Vercel cron config in `vercel.json`
- Build command: `npm run build` — always verify after changes
- Toast system: `toast({ description: "..." })` — `description` is required, not optional

## Important Paths
- `prisma/schema.prisma` — database schema
- `src/lib/auth.ts` — NextAuth config
- `src/lib/prisma.ts` — Prisma client singleton
- `src/lib/email-templates.ts` — all transactional email HTML templates (40+ hardcoded)
- `src/lib/email-marketing-layout.ts` — marketing email layout, block rendering, `EmailLayoutOptions` for header/footer customization
- `src/lib/nav-config.ts` — sidebar navigation structure
- `src/lib/api-key-auth.ts` — API key scopes and authentication (dashboard keys)
- `src/lib/server-auth.ts` — `requireAuth()` for session-based dashboard API routes
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

## Testing
- **Unit/Integration**: Vitest (`vitest.config.mts`, `vitest.integration.config.mts`)
- **E2E**: Playwright (`playwright.config.ts`)
- **Test dir**: `src/__tests__/` with subdirectories per domain
- **Cowork tests**: `src/__tests__/cowork-routing.test.ts` — 15 unit + 3 integration tests
