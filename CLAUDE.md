# Amana OSHC EOS Dashboard

## Memory System
At the start of every session, read the memory files in `~/.claude/projects/-Users-jaydenkowaider-Developer-amana-eos-dashboard/memory/`:
- `MEMORY.md` — loaded automatically, top-level index
- `decisions.md` — architectural decisions and technical rationale
- `people.md` — team members, roles, and stakeholders
- `preferences.md` — coding style, workflow preferences, tool choices
- `user.md` — user-specific context and interaction patterns

At the end of every session (or when significant learnings occur), update the relevant memory files with new information discovered during the session. Remove outdated entries. Keep files concise.

## Project Overview
- **Product**: EOS (Entrepreneurial Operating System) management dashboard for Amana OSHC (Out of School Hours Care)
- **Stack**: Next.js 16, TypeScript, Prisma ORM 5.22, PostgreSQL, Tailwind CSS, Vercel
- **Auth**: NextAuth.js with credential-based login
- **Email**: Resend API with branded HTML templates
- **State**: React Query (TanStack Query) for server state

## Key Conventions
- Prisma schema changes: use `npx prisma db push` (not migrations)
- Cron jobs: Bearer CRON_SECRET auth via `verifyCronSecret`, idempotency via `acquireCronLock`
- API key auth: `authenticateApiKey(req, scope)` with scope-based access
- Cowork API pattern: API key auth + `checkApiKeyRateLimit`
- Nav config: centralized in `src/lib/nav-config.ts` with sections (Operations, Strategy, Engagement, HR)
- Email templates: inline styles in `src/lib/email-templates.ts`, use `baseLayout()` wrapper and `buttonHtml()` for CTAs
- Vercel cron config in `vercel.json`
- Build command: `npm run build` — always verify after changes

## Important Paths
- `prisma/schema.prisma` — database schema
- `src/lib/auth.ts` — NextAuth config
- `src/lib/prisma.ts` — Prisma client singleton
- `src/lib/email-templates.ts` — all transactional email HTML templates
- `src/lib/nav-config.ts` — sidebar navigation structure
- `src/lib/api-key-auth.ts` — API key scopes and authentication
- `src/app/(dashboard)/settings/SettingsContent.tsx` — settings UI including API scopes
- `vercel.json` — cron schedules and build config
