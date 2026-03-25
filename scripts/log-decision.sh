#!/bin/bash
# Log a business decision with automatic 30-day review date
# Usage: ./scripts/log-decision.sh "decision" "reasoning" "expected outcome"

set -euo pipefail

CSV_FILE="$(dirname "$0")/../decisions.csv"
DATE=$(date +%Y-%m-%d)
REVIEW_DATE=$(date -v+30d +%Y-%m-%d 2>/dev/null || date -d "+30 days" +%Y-%m-%d)

DECISION="${1:?Usage: log-decision.sh \"decision\" \"reasoning\" \"expected outcome\"}"
REASONING="${2:?Missing reasoning}"
EXPECTED="${3:?Missing expected outcome}"

# Escape commas and quotes for CSV
escape_csv() {
  local val="$1"
  if [[ "$val" == *","* || "$val" == *'"'* || "$val" == *$'\n'* ]]; then
    val="${val//\"/\"\"}"
    val="\"$val\""
  fi
  echo "$val"
}

ROW="$DATE,$(escape_csv "$DECISION"),$(escape_csv "$REASONING"),$(escape_csv "$EXPECTED"),$REVIEW_DATE,ACTIVE"

echo "$ROW" >> "$CSV_FILE"
echo "Decision logged. Review due: $REVIEW_DATE"
