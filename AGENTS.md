# AGENTS.md — Amana OSHC EOS Dashboard

Codex (and any other agent) reads this file first. It is deliberately short:
the detail lives in two other files you MUST read before changing code.

1. **`CLAUDE.md`** (repo root) — the full project rulebook: stack, commands,
   conventions, every feature's invariants and the bugs they exist to
   prevent. Everything in it applies to you. Treat "Claude" in it as "the
   agent".
2. **`docs/handoff/2026-10-09-codex-handoff.md`** — where the work is right
   now, what's next (with specs), open questions, and the working rules
   Daniel has set.

## Who you're working for

Daniel, Director of Amana OSHC (Outside School Hours Care, NSW, Australia).
He writes by voice: "owner"/"Ona" = **OWNA** (the childcare system we are
replacing), "Cameron" = Camera. Read for intent. He wants things shipped,
not clarification threads — make the sensible call and say what you chose.

## Non-negotiables

- **Never touch production data.** `.env.local` `DATABASE_URL` is the LOCAL
  db. Prod is only in `PROD_DATABASE_URL*` and must never be used by default.
  Never pass a real database as `--shadow-database-url` (it wipes it).
- **Never enter or echo passwords, tokens or secrets.** Daniel does those.
- **Brand**: Midnight Green `#004E64`, Jonquil `#FECE00`, Lemon Chiffon
  `#FFF2BF`, Cosmic Latte `#FFFAE6`. In code use the design tokens in
  `src/app/globals.css` — never raw hex/grey classes.
- **Copy**: warm, plain, short, Australian English. Community care
  provider, not a corporation. Rooted in Islamic values, never exclusionary.
- **Sydney time**: use `src/lib/timezone.ts` helpers. Never
  `new Date().toISOString().slice(0,10)` (a guard test fails on it). Run
  date-touching tests under `TZ=UTC` as well.
- **Roles**: office = `ADMIN_ROLES` (owner/head_office/admin — import it,
  never inline the array). `member` = a centre's shared login
  (`isCentreAccount`) and is the ONLY "Coordinator" access. People who
  coordinate log in as `staff`.

## Ship loop

feature branch → `npx vitest run` (3 parent install-banner files already
fail on main — ignore those only) → `npm run lint` (0 errors) →
`npm run build` → push branch → Vercel preview green → **ask Daniel before
merging to main**. Check UI changes in a browser at phone width (375px) and
desktop, as a centre login AND as an educator.
