#!/usr/bin/env bash
# Old card-details cleanup against PRODUCTION — docs/security/payment-card-cleanup.md
#
#   bash scripts/card-cleanup-production.sh                 # dry run: counts only, changes nothing
#   bash scripts/card-cleanup-production.sh --apply --expect-candidates=<n> --actor=<your user id>
#
# Asks for the production DATABASE_URL (use the DIRECT / unpooled one) and
# FIELD_ENCRYPTION_KEY — both from Vercel → Settings → Environment Variables
# (Production). Typing is hidden; the values go only to this one process and
# are never written to disk or shell history. The report holds record ids
# and field NAMES only — never a card number.
set -euo pipefail
cd "$(dirname "$0")/.."

read -r -s -p "Production DATABASE_URL (direct/unpooled): " DB_URL; echo
read -r -s -p "Production FIELD_ENCRYPTION_KEY: " ENC_KEY; echo
[ -n "$DB_URL" ] && [ -n "$ENC_KEY" ] || { echo "Both values are needed." >&2; exit 1; }

REPORT="${HOME}/Desktop/card-cleanup-$(date +%Y%m%d-%H%M).json"
DATABASE_URL="$DB_URL" FIELD_ENCRYPTION_KEY="$ENC_KEY" CONFIRM_PRODUCTION=yes \
  npx tsx scripts/payment-card-inventory.ts --production --report="$REPORT" "$@"
unset DB_URL ENC_KEY
