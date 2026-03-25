#!/bin/bash
# Daily cron script: flags decisions whose review date has arrived
# Run via: crontab -e → 0 9 * * * /path/to/scripts/flag-reviews.sh

set -euo pipefail

CSV_FILE="$(dirname "$0")/../decisions.csv"
TODAY=$(date +%Y-%m-%d)
TEMP_FILE=$(mktemp)
FLAGGED=0

# Read CSV, flag any ACTIVE rows where review_date <= today
head -1 "$CSV_FILE" > "$TEMP_FILE"

tail -n +2 "$CSV_FILE" | while IFS= read -r line; do
  # Extract review_date (5th field) and status (6th field)
  review_date=$(echo "$line" | awk -F',' '{print $5}')
  status=$(echo "$line" | awk -F',' '{print $6}')

  if [[ "$status" == "ACTIVE" ]] && [[ "$review_date" < "$TODAY" || "$review_date" == "$TODAY" ]]; then
    # Replace ACTIVE with REVIEW_DUE
    echo "${line/,ACTIVE/,REVIEW_DUE}" >> "$TEMP_FILE"
    FLAGGED=$((FLAGGED + 1))
  else
    echo "$line" >> "$TEMP_FILE"
  fi
done

mv "$TEMP_FILE" "$CSV_FILE"

if [ "$FLAGGED" -gt 0 ]; then
  echo "$FLAGGED decision(s) flagged for review."
else
  echo "No decisions due for review today."
fi
