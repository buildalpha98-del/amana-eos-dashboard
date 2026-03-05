# Lessons Learned

## Patterns & Rules
_Corrections and patterns captured here to prevent repeat mistakes._

### Prisma
- `Json` type fields don't accept `Record<string, unknown>` directly. Use `JSON.parse(JSON.stringify(value))` to satisfy `InputJsonValue`.
- Always check if project uses migrations (`prisma/migrations/` dir) or `db push`. This project uses `db push` — never add `prisma migrate deploy` to build scripts.
- When adding models, check if existing models (e.g. `ActivityLog`) can be reused. If they have required fields like `userId` that don't apply to system operations, create a dedicated model instead.

### Tooling
- Files read by subagents are NOT cached for the main agent. Must re-read files with `Read` tool before using `Write` or `Edit`.
- `prisma migrate dev` requires interactive terminal — use `prisma db push` in non-interactive environments.

### Git
- Always check `git status` before committing to see if branch is behind remote.
- When stash pop conflicts, the stash is kept — must `git stash drop` after resolving.
- Remove `.git/index.lock` if a previous git process crashed.

### Next.js
- Middleware matcher uses `:path*` syntax (not `*` alone) for catch-all route matching.
- Next.js 16 renamed "middleware" to "proxy" convention (warning only, still works).

## Session Log

### 2026-03-05 — P0 Security Fixes
- Implemented Upstash Redis rate limiting with in-memory fallback
- Created `withApiAuth()` HOF for centralized API auth
- Added 13 missing API routes to middleware matcher
- Created `CronRun` model + `acquireCronLock()` for cron idempotency
- Applied guards to all 6 cron routes
- Build verified clean (147 pages, 0 TS errors)
- Deployed to Vercel via git push
