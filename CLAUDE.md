# Amana OSHC EOS Dashboard

## Project Overview
- **Product**: EOS (Entrepreneurial Operating System) management dashboard for Amana OSHC (Out of School Hours Care)
- **Stack**: Next.js 16 (App Router), React 19, TypeScript, Prisma ORM 5.22, PostgreSQL, Tailwind CSS 4, Vercel
- **Auth**: NextAuth.js v4 with credential-based login (bcrypt passwords, JWT sessions)
- **Email**: Resend API with suppression-aware sending and branded HTML templates
- **State**: React Query (TanStack Query v5) for server state
- **AI**: Anthropic SDK (`@anthropic-ai/sdk`) for AI assistant features
- **UI**: Radix UI primitives + custom components, Lucide icons, Recharts for charts
- **Rate Limiting**: Upstash Redis (production) with in-memory fallback (dev)
- **File Storage**: Vercel Blob
- **Integrations**: Xero (payroll/finance), Microsoft Calendar (Azure AD), WhatsApp (360dialog), Meta Social, Brevo, OWNA (childcare platform)

## Commands
- `npm run build` — `prisma generate && next build` (always verify after changes)
- `npm run dev` — start dev server
- `npm run lint` — ESLint
- `npm run test` — Vitest (run all tests)
- `npm run test:watch` — Vitest in watch mode
- `npm run db:push` — push Prisma schema to database (preferred over migrations)
- `npm run db:studio` — open Prisma Studio
- `npm run db:seed` — seed database with initial data

## Architecture

### App Router Structure
The app uses Next.js App Router with two route groups:
- `src/app/(auth)/` — login, forgot-password, reset-password (public pages)
- `src/app/(dashboard)/` — all authenticated pages (35+ modules)
- `src/app/survey/` — public survey pages (exit surveys, parent feedback)
- `src/app/api/` — API routes (350+ route handlers)

### Dashboard Modules
Organized by nav sections defined in `src/lib/nav-config.ts`:
- **EOS**: Dashboard, My Portal, Vision/V-TO, Rocks, To-Dos, Issues, Scorecard
- **Operations**: Financials, Performance, Services, Compliance, Holiday Quest
- **Strategy**: Scenarios, Data Room, Board Reports, AI Assistant
- **Engagement**: Enquiries, CRM, Marketing, Communication, Conversions, Projects, Meetings
- **HR**: Recruitment, Timesheets, Leave, Contracts
- **Support**: Tickets
- **Tools**: CCS Calculator, The Amana Way
- **Admin**: Documents, Staff Lifecycle (Onboarding/LMS/Offboarding), Team, Settings

### Role System
Seven roles with hierarchical permissions (defined in `src/lib/role-permissions.ts`):

| Role | DB Value | Display Name |
|------|----------|--------------|
| Owner | `owner` | Owner |
| Head Office | `head_office` | State Manager |
| Admin | `admin` | Admin |
| Marketing | `marketing` | Marketing |
| Coordinator | `coordinator` | Service Coordinator |
| Member | `member` | Centre Director |
| Staff | `staff` | Educator |

- Page-level access enforced by `src/middleware.ts` (Edge runtime, duplicated role map)
- API auth via `requireAuth()` or `withApiAuth()` wrapper in `src/lib/server-auth.ts`
- Feature-level permissions via `hasFeature(role, feature)` in `src/lib/role-permissions.ts`

### API Patterns

**Authenticated endpoints** (session-based):
```ts
// Simple role check
const { session, error } = await requireAuth(["owner", "admin"]);
if (error) return error;

// Or use the wrapper (preferred for new code)
export const GET = withApiAuth(async (req, session) => {
  return NextResponse.json({ data: [] });
}, { minRole: "admin" });

// Feature-based check
export const PATCH = withApiAuth(handler, { feature: "timesheets.approve" });
```

**Cron endpoints** (`src/app/api/cron/`):
```ts
const authCheck = verifyCronSecret(req);
if (authCheck) return authCheck.error;

const guard = await acquireCronLock("daily-digest", "daily");
if (!guard.acquired) return NextResponse.json({ skipped: true });
try {
  // ... work ...
  await guard.complete({ emailsSent: 5 });
} catch (err) {
  await guard.fail(err);
  throw err;
}
```

**Cowork API endpoints** (`src/app/api/cowork/`):
External integration endpoints using database-backed API keys with scope-based access:
```ts
const { apiKey, error } = await authenticateApiKey(req, "programs:write");
if (error) return error;
// Then apply rate limiting via checkApiKeyRateLimit
```

### Database
- **Schema**: `prisma/schema.prisma` (3600+ lines, 130+ models, 65+ enums)
- **Schema changes**: Use `npx prisma db push` (not migrations) per project convention
- **Client singleton**: `src/lib/prisma.ts`
- **Seeds**: `prisma/seed.ts` (main), `prisma/seeds/` and `scripts/` for domain-specific seeds

### Key Models
Core EOS: `Rock`, `Todo`, `Issue`, `Scorecard`, `Measurable`, `Meeting`, `VisionTractionOrganiser`
Services: `Service`, `CentreMetrics`, `DailyAttendance`, `ProgramActivity`
People: `User`, `StaffOnboarding`, `StaffOffboarding`, `EmploymentContract`, `LeaveRequest`, `Timesheet`
Finance: `FinancialPeriod`, `CashFlowPeriod`, `EBITDAAdjustment`, `OverdueFeeRecord`
Engagement: `ParentEnquiry`, `Lead`, `MarketingCampaign`, `MarketingPost`, `Announcement`
Compliance: `ComplianceCertificate`, `AuditTemplate`, `AuditInstance`, `Policy`
System: `ApiKey`, `CronRun`, `ActivityLog`, `NotificationDismissal`

## Key Conventions
- **Prisma schema changes**: use `npx prisma db push` (not migrations)
- **Cron jobs**: Bearer `CRON_SECRET` auth via `verifyCronSecret`, idempotency via `acquireCronLock` (daily/weekly/monthly periods)
- **API key auth**: `authenticateApiKey(req, scope)` with SHA-256 hashed keys and scope-based access
- **Cowork API pattern**: API key auth + `checkApiKeyRateLimit`
- **Nav config**: centralized in `src/lib/nav-config.ts` — add new pages here
- **Email**: `sendEmail()` from `src/lib/email.ts` (suppression-aware), templates in `src/lib/email-templates.ts` using `baseLayout()` wrapper and `buttonHtml()` for CTAs — all inline styles
- **Vercel cron config**: `vercel.json` — 30+ scheduled jobs
- **Build command**: `npm run build` — always verify after changes
- **Path alias**: `@/*` maps to `./src/*`
- **Date formatting**: Australian locale (`en-AU`, DD/MM/YYYY) via `formatDateAU()` in `src/lib/utils.ts`
- **Environment validation**: `src/lib/env.ts` — required vars throw in production, feature vars degrade gracefully
- **Security headers**: configured in `next.config.ts` (X-Frame-Options, HSTS, CSP, etc.)
- **Zod validation**: Zod v4 for runtime validation (schemas in `src/lib/schemas/`)
- **Form handling**: React Hook Form with `@hookform/resolvers` for Zod integration
- **Hooks pattern**: domain-specific React Query hooks in `src/hooks/` (e.g., `useRocks`, `useMarketing`) — each encapsulates queries and mutations for a module
- **Component organization**: domain components in `src/components/<module>/`, shared UI in `src/components/ui/`
- **Local dev database**: `docker-compose.yml` provides PostgreSQL

## Important Paths
- `prisma/schema.prisma` — database schema (source of truth for all models)
- `src/middleware.ts` — NextAuth middleware + role-based page access (Edge runtime)
- `src/lib/auth.ts` — NextAuth config (credentials provider, JWT callbacks)
- `src/lib/server-auth.ts` — `requireAuth()` and `withApiAuth()` for API routes
- `src/lib/role-permissions.ts` — role hierarchy, page access, feature permissions
- `src/lib/prisma.ts` — Prisma client singleton
- `src/lib/email.ts` — Resend email sending with suppression handling
- `src/lib/email-templates.ts` — all transactional email HTML templates (70KB+)
- `src/lib/nav-config.ts` — sidebar navigation structure (sections: EOS, Operations, Strategy, Engagement, HR, Support, Tools, Admin)
- `src/lib/api-key-auth.ts` — API key scopes and authentication for Cowork endpoints
- `src/lib/cron-guard.ts` — cron idempotency lock (`verifyCronSecret`, `acquireCronLock`)
- `src/lib/rate-limit.ts` — Upstash Redis rate limiter with in-memory fallback
- `src/lib/env.ts` — environment variable validation (Zod schema)
- `src/lib/health-score.ts` — service health score computation engine
- `src/lib/scenario-engine.ts` — financial what-if scenario modelling
- `src/lib/board-report-generator.ts` — automated board report generation
- `src/lib/xero.ts` / `xero-sync.ts` / `xero-payroll.ts` — Xero accounting integration
- `src/lib/owna.ts` — OWNA childcare platform integration
- `src/lib/ai.ts` / `ai-context.ts` / `ai-narratives.ts` — AI assistant context & narratives
- `src/lib/storage.ts` — Vercel Blob file storage
- `src/lib/teams-notify.ts` — Microsoft Teams webhook notifications
- `src/hooks/` — 54 custom React Query hooks organized by domain (useRocks, useMarketing, useTimesheets, etc.)
- `src/types/index.ts` — NextAuth session & JWT type augmentation (adds `id`, `role`, `serviceId`, `state`)
- `src/components/ui/` — shared UI primitives (Button, Dialog, Sheet, Skeleton, etc.)
- `src/components/layout/` — Sidebar, TopBar, CommandPalette, SidebarContext
- `src/components/providers/` — React context providers (QueryClient, Session)
- `vercel.json` — Vercel cron schedules and build config
- `next.config.ts` — Next.js config with security headers
- `vitest.config.mts` — test configuration

## Testing
- Framework: Vitest with `@testing-library/react`
- Config: `vitest.config.mts`
- Test directory: `src/__tests__/` (subdirs: `api/`, `lib/`, `helpers/`)
- Setup file: `src/__tests__/setup.ts`
- Run: `npm run test` (single run) or `npm run test:watch`

## Environment Variables
Required (fatal in production if missing):
- `DATABASE_URL` — PostgreSQL connection string
- `NEXTAUTH_SECRET` — JWT signing secret
- `NEXTAUTH_URL` — app base URL
- `CRON_SECRET` — bearer token for cron endpoint auth

Feature flags (degrade gracefully if missing):
- `RESEND_API_KEY` — email sending
- `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` — rate limiting
- `AZURE_AD_*` — Microsoft Calendar integration
- `XERO_*` — Xero accounting integration
- `WHATSAPP_*` — WhatsApp messaging
- `META_*` — Meta/Facebook social integration
- `TEAMS_WEBHOOK_URL` — Microsoft Teams notifications

## Memory System
At the start of every session, read the memory files in `~/.claude/projects/-Users-jaydenkowaider-Developer-amana-eos-dashboard/memory/`:
- `MEMORY.md` — loaded automatically, top-level index
- `decisions.md` — architectural decisions and technical rationale
- `people.md` — team members, roles, and stakeholders
- `preferences.md` — coding style, workflow preferences, tool choices
- `user.md` — user-specific context and interaction patterns

At the end of every session (or when significant learnings occur), update the relevant memory files with new information discovered during the session. Remove outdated entries. Keep files concise.
