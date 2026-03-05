# AmanaEOS Dashboard - Task Tracker

## Current Status
> P0 security fixes deployed. Pending: Upstash env vars + production DB schema sync.

### Post-Deploy Checklist
- [ ] Create Upstash Redis instance and add `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` to Vercel env vars
- [ ] Run `DATABASE_URL="production-url" npx prisma db push` to create `CronRun` table in production
- [ ] Verify rate limiting works in production (fail login 6+ times)
- [ ] Verify cron idempotency (call a cron endpoint twice, second should return `skipped: true`)

---

## Completed

### P0 Security Fixes (2026-03-05) ✅
- [x] Fix 1: Upstash Redis rate limiting (replaces in-memory Map)
- [x] Fix 2: `withApiAuth()` wrapper + 13 missing middleware routes
- [x] Fix 3: `CronRun` model + `acquireCronLock()` on all 6 cron routes
- [x] Build verification (0 TS errors, 147 pages)
- [x] Git commit + push to origin/main

### Deep Dive Code Review (2026-03-05) ✅
- [x] Full codebase review (73 models, 200+ endpoints)
- [x] Identified 4 P0, 10 P1, 8 P2, 10 P3 improvements

## Review Notes
- P0 fixes are deployed but Upstash Redis needs env vars configured for full production rate limiting (falls back to in-memory without them — no regression, but not the fix)
- Remaining review items: P1 (input validation/Zod, pagination, error boundaries, audit logging, session management, password policy, XSS in rich text, CSRF tokens, SQL injection in raw queries, env var validation)
