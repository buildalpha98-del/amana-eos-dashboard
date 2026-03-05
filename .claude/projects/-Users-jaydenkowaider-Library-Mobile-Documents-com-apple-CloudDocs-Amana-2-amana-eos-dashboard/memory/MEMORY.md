# AmanaEOS Dashboard - Project Memory

## Workflow Rules (User Enforced)
1. **Plan First** - Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
2. **Subagent Strategy** - Use subagents liberally, one task per subagent, keep main context clean
3. **Self-Improvement Loop** - After ANY correction: update `tasks/lessons.md` with the pattern
4. **Verify Before Done** - Never mark complete without proving it works (tests, logs, screenshots)
5. **Depth + Elegance** - For non-trivial changes, pause and ask "is there a more elegant way?"
6. **Autonomous Bug Fixing** - Just fix bugs. Don't ask for hand-holding. Point at logs, resolve.
7. **Task Management** - Plan in `tasks/todo.md`, track progress, explain changes, document results

## Tech Stack
- Next.js 16 + React 19 + TypeScript (strict)
- PostgreSQL + Prisma ORM v5.22
- Tailwind CSS 4 + Radix UI
- TanStack React Query v5
- NextAuth.js v4 (credentials provider)
- Xero API (financials, expanding to payroll)
- Microsoft Graph (calendar)
- Resend (email)
- Deployed on Vercel

## External Systems
- **OWNA** - Childcare management, rosters (exports to Employment Hero currently)
- **Employment Hero** - Being replaced. Currently handles: staff details, onboarding, contracts, LMS, payroll
- **Xero** - Taking over payroll from Employment Hero. Already connected for financials.
- Target flow: OWNA (rosters) -> AmanaEOS (timesheet confirm/approve) -> Xero Payroll (process pay)

## Key Architecture Notes
- App Router with `(dashboard)` and `(auth)` route groups
- 4-tier RBAC: owner > admin > member > staff
- Staff scoped to services (centres)
- 60+ Prisma models
- See `tasks/lessons.md` for correction patterns
