#!/usr/bin/env bash
# Delete remote branches that predate the PR #214 seed fix (create-only staff
# upsert) and are fully merged into main. A Vercel preview deploy from any of
# these runs the old seed against the shared prod DB and demotes real users
# (Tracie/Mirna head_office -> member, three times as of 2026-08-31).
#
# Every branch below was verified merged (ancestry) on 2026-08-31, and each is
# RE-verified at run time before deletion — a branch that has since received
# new commits is skipped, never deleted.
#
# Usage: bash scripts/cleanup-pre-214-branches.sh
set -euo pipefail
git fetch origin --prune
deleted=0; skipped=0
while read -r b; do
  [ -z "$b" ] && continue
  if ! git show-ref --verify -q "refs/remotes/origin/$b"; then
    echo "gone already: $b"; continue
  fi
  if git merge-base --is-ancestor "refs/remotes/origin/$b" origin/main; then
    if err=$(git push origin ":refs/heads/$b" 2>&1 >/dev/null); then
      echo "deleted: $b"; deleted=$((deleted+1))
    else
      echo "FAILED to delete: $b — $err"
    fi
  else
    echo "SKIPPED (has commits not in main): $b"; skipped=$((skipped+1))
  fi
done <<'BRANCHES'
chore/hooks-standards-sweep
chore/rename-service-overview-tabs
claude/amana-ambassadors-review-d0a265
claude/creative-requests-phase2
claude/fix-onboarding-todo-paths
claude/lms-publish-onboarding-24ee80
claude/marketing-dashboard-rebuild-ca08c4
claude/marketing-email-phase3
claude/marketing-hub-phase4
claude/nav-stage1-folds
claude/nav-stage1-folds-2
feat/add-marketing-to-eos-assignees
feat/admin-all-regions-and-payment-reveal
feat/aged-debtors-money
feat/ai-post-writer
feat/assign-duplicate-enrolment-service
feat/autogrow-meeting-notes
feat/backfill-enrolment-services
feat/billing-family-accounts
feat/block-out-dates-and-enrolled-only
feat/card-expiry-reminders
feat/casual-educator-template-preset
feat/casual-fees-from-rooms
feat/casual-names-and-cancel-rules
feat/centre-dashboard-educators
feat/child-details-bulk-billing
feat/contract-auto-supersede-on-issue
feat/contract-issue-collect-all-custom-tags
feat/contract-part-time-min-hours
feat/contract-supersede-checkbox
feat/contract-template-prior-agreements-clause
feat/coordinator-permanent-preset
feat/debtor-search-and-chase-log
feat/enrol-back-to-intro-and-child-labels
feat/enrol-compliance-fees-mobile
feat/enrol-intro-language-picker
feat/enrol-intro-school-and-change
feat/enrol-more-schools
feat/enrol-translations-plumbing
feat/enrol-translations-seed
feat/enrolment-docs-and-photo-context
feat/enrolment-draft-foundation
feat/enrolment-wizard-me-step
feat/eos-assignee-filter
feat/eos-financial-year-quarters
feat/excursions-risk-assessments
feat/extra-booking-types-and-app-nav
feat/families-admin-and-email-branding
feat/family-account-and-service-links
feat/family-balance-edit-and-followup
feat/family-balance-parent-email
feat/family-balance-service-picker
feat/family-balance-thread-and-ui-fix
feat/family-balance-tracker
feat/family-billing-and-payments
feat/family-detail-billing
feat/family-enrolment-reminder
feat/family-name-editor
feat/family-transactions-ledger
feat/first-day-photo-in-app
feat/first-session-badge
feat/form-signatures-pdf
feat/forms-place-per-child-attendance
feat/generate-statement-from-bookings
feat/headcounts-evacuations
feat/home-feed-back
feat/job-ad-templates
feat/l10-scorecard-edit-and-resize
feat/leadership-meetings
feat/meeting-scorecard-grid
feat/my-centre-tabs-and-parent-forms
feat/my-day-phone-surface
feat/native-date-picker-and-enabled-sessions
feat/nav-consolidation-p1
feat/nav-relocations-and-tablet
feat/nudge-recipients-narrow
feat/one-calendar-and-cleanup
feat/parent-accounts-phase1
feat/parent-app-native-feel
feat/parent-child-page-refinements
feat/parent-enrol-steps
feat/parent-enrolment-gate
feat/parent-feed-and-pickups
feat/parent-my-centre-and-home
feat/parent-payment-method
feat/parent-posts-feed
feat/parent-week-view-push-today
feat/portal-nurture-and-placement-reason
feat/post-planning-cycle
feat/post-scheduling-tags-pickup-backfill
feat/posts-tab-and-my-centre
feat/recurring-bookings-not-cancellable
feat/rocks-my-rocks-view-and-tighter-assignees
feat/role-eos-member
feat/room-config-fields
feat/room-configuration-advisor
feat/room-detail-panel
feat/rooms-and-fees
feat/scheduled-fee-changes
feat/scorecard-five-weeks
feat/scorecard-view-toggle-and-picker
feat/seed-default-templates-button
feat/service-app-settings
feat/service-info-messages-child-info
feat/service-memberships-scope
feat/service-nav-favourites
feat/service-nav-tree
feat/service-registers
feat/settings-manage-centre-access
feat/sign-in-out-screen
feat/signup-autologin
feat/simplify-eos-role-single-option
feat/staff-sidebar-my-portal
feat/state-picker-all-regions-widening
feat/survey-notify-and-todo
feat/undo-absence
feat/waitlist-page
feat/website-careers-funnel
feat/week-pager-brand-voice-nav
feat/wire-up-orphaned-actions
fix/admin-sees-all-services
fix/attendance-next-week
fix/booking-days-and-code-leaks
fix/casual-settings-are-enforced
fix/contract-only-block-referenced-tags
fix/contract-part-time-hours-sentence
fix/contract-preview-editor-link
fix/contract-preview-fresh-read
fix/contract-preview-show-template-name
fix/contract-step2-sample-notice
fix/contract-wizard-reorder
fix/coordinator-preset-refinements
fix/cron-get-method
fix/enrol-form-feedback
fix/enrol-intro-hook-order
fix/enrol-post-submit
fix/enrol-sessions-and-fields
fix/enrol-upload-and-booking-grid
fix/enrolment-service-link-and-child-details
fix/expense-modal-ios
fix/family-balance-modal-portal
fix/family-balance-modal-ui
fix/header-padding-and-multi-day-booking
fix/medicare-required
fix/my-expenses-mobile-submit
fix/nurture-dedup-log
fix/orphan-sweep-round-1
fix/parent-auth-gate-duplication
fix/parent-login-password
fix/parent-onboarding-401-loop
fix/parent-public-401-guard
fix/parent-public-routes
fix/parent-v2-feature-parity
fix/payment-reveal-service-tabs
fix/privacy-policy-page
fix/rate-limit-redis-failover
fix/school-match-and-posts-tab
fix/seed-defaults-upsert
fix/service-details-validation
fix/tall-dialog-overflow
fix/updates-move-to-my-centre
fix/user-menu-eos-roles
fix/vacancy-modal-bugs
fix/vacancy-modal-height
fix/vacancy-website-toggle
BRANCHES
echo "done — deleted $deleted, skipped $skipped"
