#!/usr/bin/env bash
# Vercel build entrypoint (vercel.json → buildCommand).
#
# - Migrations run on PRODUCTION builds only. DATABASE_URL is the production
#   Neon database in every Vercel environment, so a preview build running
#   `migrate deploy` applied unreviewed feature-branch migrations straight to
#   prod (20260927000000_knowledge_store landed that way from a preview).
# - A failed migration FAILS the build. `migrate deploy || true` let new code
#   go live against the old schema — 500s behind a green deploy. A failed
#   build keeps the last good deployment serving, which is the safe failure.
# - Retries absorb Neon's scale-to-zero cold start, the usual cause of the
#   "database unreachable" build errors.
# - The seed is idempotent and non-fatal: it simply catches up next deploy.
set -euo pipefail

npx prisma generate

if [ "${VERCEL_ENV:-}" = "production" ]; then
  for attempt in 1 2 3; do
    if npx prisma migrate deploy; then
      break
    fi
    if [ "$attempt" -eq 3 ]; then
      echo "prisma migrate deploy failed after 3 attempts — aborting so the last good deployment stays live." >&2
      exit 1
    fi
    echo "prisma migrate deploy failed (attempt $attempt) — retrying in $((attempt * 10))s…" >&2
    sleep $((attempt * 10))
  done

  npx tsx prisma/seed.ts || echo "WARN: seed failed (non-fatal; idempotent, reruns next deploy)" >&2
else
  echo "VERCEL_ENV=${VERCEL_ENV:-unset}: skipping migrate + seed — previews must never write the production schema."
fi

npx next build
