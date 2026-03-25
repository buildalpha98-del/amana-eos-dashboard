#!/bin/bash
# Surface all decisions flagged for review
# Usage: ./scripts/review.sh

set -euo pipefail

CSV_FILE="$(dirname "$0")/../decisions.csv"

echo "========================================="
echo "  DECISIONS DUE FOR REVIEW"
echo "  $(date +%Y-%m-%d)"
echo "========================================="
echo ""

COUNT=0
while IFS=',' read -r date decision reasoning expected review_date status; do
  if [[ "$status" == "REVIEW_DUE" ]]; then
    COUNT=$((COUNT + 1))
    echo "[$COUNT] $date — $decision"
    echo "    Reasoning: $reasoning"
    echo "    Expected:  $expected"
    echo "    Review was due: $review_date"
    echo ""
  fi
done < <(tail -n +2 "$CSV_FILE")

if [ "$COUNT" -eq 0 ]; then
  echo "  No decisions pending review."
else
  echo "-----------------------------------------"
  echo "  $COUNT decision(s) need your review."
  echo ""
  echo "  To mark as reviewed, edit decisions.csv"
  echo "  and change REVIEW_DUE → REVIEWED"
  echo "-----------------------------------------"
fi
