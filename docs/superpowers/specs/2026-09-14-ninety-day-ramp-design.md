# 90-Day Ramp — design (2026-09-14)

**Goal.** Finalise staff onboarding with one automated 90-day ramp per new starter: a weekly check-in email to the starter, manager competency checkpoints at day 30/60/90, a clear ramp scorecard on the staff profile and Staff Lifecycle page, and automatic probation-review creation at close. Everything runs from the dashboard with no manual scheduling.

**Decisions (Jayden, 2026-09-14).** Manager scoring at 30/60/90 (not weekly). Alerts and checkpoint requests go to the service manager AND every State Manager (`head_office`). Competencies: the six proposed below.

## What exists and what changes

| Today | After |
|---|---|
| Three account-creation paths; only Onboarding-request seeds touchpoints | `createStaffRamp()` called by all three; a daily cron sweeps any active user whose start date is within 90 days and has no ramp |
| `NewStarterCheckIn` day-1/week-1/month-1 emails, responses write-only | Replaced by `RampCheckIn` weekly ×13. Old model + public page kept read-only so already-sent links keep working; seeder and cron removed |
| `User.probationEndDate` hand-edited; `PerformanceReview(type: probation)` never auto-created | Day-90 checkpoint submission closes the ramp and creates the probation `PerformanceReview` pre-filled from the scorecard |
| `retention-checkins` 1/3/6/12-month manager todos | 1- and 3-month todos skipped for users with a ramp (covered); 6/12 unchanged. Cron bug fixed (never completed its lock) |
| No per-person onboarding view on the staff profile | New **Ramp** section on `/staff/[id]` + **Ramp** tab on `/onboarding` |

## Data model

```prisma
enum RampStatus { active, completed, extended, ended }
enum RampRecommendation { on_track, needs_support, at_risk, pass, extend, end }

model StaffRamp {
  id String @id @default(cuid())
  userId String @unique
  startDate DateTime @db.Date      // the real start date at creation
  endDate   DateTime @db.Date      // startDate + 90 (+30 per extension)
  status RampStatus @default(active)
  completedAt DateTime?
  probationReviewId String? @unique  // PerformanceReview created at close
  checkIns   RampCheckIn[]
  checkpoints RampCheckpoint[]
  createdAt/updatedAt
}
model RampCheckIn {            // starter's weekly pulse (Friday, weeks 1–13)
  id, rampId, weekNumber Int, dueAt, token @unique
  sentAt?, skipped Boolean (past-dated at creation), submittedAt?
  mood Int? (1–5), wentWell?, struggling?, needsHelp Boolean?, helpDetail?
  flaggedAt?                    // alert fan-out done
  @@unique([rampId, weekNumber]) @@index([dueAt, sentAt])
}
model RampCheckpoint {         // manager competency rating (day 30/60/90, +120…)
  id, rampId, day Int, dueAt, sentAt?, lastRemindedAt?, submittedAt?, reviewerUserId?
  ratings Json                  // { competencyKey: 1–5 }
  summary?, recommendation RampRecommendation?
  @@unique([rampId, day]) @@index([dueAt, submittedAt])
}
```

`User.probationEndDate` is stamped to `endDate` at ramp creation if null.

## Competencies (`src/lib/ramp/constants.ts`)
`child_safety` Child safety & supervision · `ratios` Ratios & compliance awareness · `programming` Programming & engagement · `families` Family communication · `teamwork` Teamwork & communication · `reliability` Reliability & punctuality. Rated 1–5. Targets: avg ≥ 3.0 at day 30, ≥ 3.5 at 60, ≥ 4.0 at 90.

## Scorecard (`computeRampScorecard`, live, no stored rows)
| Row | Source | 30 | 60 | 90 |
|---|---|---|---|---|
| Essential training | published essential LMS courses completed | 100% | 100% | 100% |
| WWCC on file | current `wwcc` cert | ✓ | ✓ | ✓ |
| Policies acknowledged | `REQUIRED_POLICY_TITLES` | 100% | 100% | 100% |
| Shifts worked | RosterShift (userId, date < today, status published) | ≥ 8 | ≥ 16 | ≥ 24 |
| Punctuality | shifts with actualStart ≤ shiftStart+5min / shifts with actualStart | ≥ 85% | ≥ 90% | ≥ 90% |
| Check-in response | submitted / sent | ≥ 75% | ≥ 75% | ≥ 75% |
| Mood trend | avg of last 3 moods | ≥ 3.5 | ≥ 3.5 | ≥ 3.5 |
| Manager rating | latest checkpoint avg | ≥ 3.0 | ≥ 3.5 | ≥ 4.0 |

Each row → `met | behind | pending`. Overall: `at_risk` if any flagged check-in in last 14d or latest checkpoint `at_risk`; `needs_support` if ≥ 2 rows behind or checkpoint `needs_support`; else `on_track`.

## Automation
- **`createStaffRamp(userId, startDate)`** — idempotent (unique userId). Seeds 13 check-ins (Fridays from start; rows whose `dueAt` < now−3d are `skipped`) and checkpoints 30/60/90 (`dueAt` = start+day). Called from `POST /api/onboarding-requests`, `POST /api/recruitment/candidates/[id]/convert` (when `newStarter`), `POST /api/users` (when `newStarter`).
- **Cron `ramp-weekly-checkin`** (Fri 05:00 UTC = 3pm AEST): sends due, unsent, unskipped check-ins; inactive user → mark sent. Ramps not `active` are ignored.
- **Cron `ramp-daily`** (daily 20:30 UTC): (a) sweep — active users with `startDate` within 90 days and no ramp → create; (b) send due checkpoint requests to service manager + State Managers (email + `notifyUsers`); remind every 7 days while unsubmitted; (c) ramps `active` with `endDate` < today and no submitted day-90 checkpoint → reminder handled by (b).
- **Check-in submit** (public, token): if `mood ≤ 2` or `needsHelp` → email + notify service manager + State Managers, stamp `flaggedAt`.
- **Checkpoint submit** (authenticated): day 30/60 → `on_track | needs_support | at_risk`. Day 90 (or later) → `pass` closes (`completed`, probation `PerformanceReview` created `manager_review` with `managerAssessment` = scorecard summary + competency ratings, `reviewerUserId` = submitter, `periodStart/End` = ramp dates, `dueDate` = today+7); `extend` → `extended`, `endDate += 30`, new checkpoint at `day+30`; `end` → `ended`. Starter is notified on close (in-app).

## API
- `GET /api/ramps` — active ramps list (owner/head_office/admin all; member scoped to own service). Includes scorecard status, last mood, next due item.
- `GET /api/ramps/[userId]` — ramp + scorecard + check-ins + checkpoints. Access = `canAccessProfile` rules (self/admin/same-service member). Self view omits checkpoint `summary`/`recommendation`? No — starter sees ratings (transparency) but not `at_risk` copy; keep simple: self sees everything except checkpoint `summary`.
- `POST /api/ramps/[userId]/checkpoints/[day]` — submit ratings; allowed: admin-tier, or `member` who is the service manager of the starter's service.
- `GET/POST /api/public/ramp-checkin/[token]` — same pattern as the existing public check-in route (IP rate limit 10/15min, idempotent).
- Crons under `/api/cron/ramp-weekly-checkin`, `/api/cron/ramp-daily` (CRON_SECRET + lock + `withApiHandler`).

## UI
- **Staff profile** `RampSection` (between Documents and Performance; only when a ramp exists): status chip + "Day X of 90" bar; scorecard table with 30/60/90 targets; weekly check-in timeline (mood dots, comments, help flags); checkpoint cards with the rating form for managers/admins.
- **Staff Lifecycle → Ramp tab** (admin): table of active ramps — name, service, day, status, last mood, next due, flags → profile link.
- **Public page** `/ramp-checkin/[token]`: mood 1–5, what went well, what's been hard, "do you need anything from us?" + detail.
- Notification types: `RAMP_CHECKIN_FLAGGED`, `RAMP_CHECKPOINT_DUE`, `RAMP_COMPLETED`.

## Out of scope
Weekly manager ratings; editing competencies in Settings; my-portal ramp widget (emails cover the starter); dropping `NewStarterCheckIn`.

## Testing
Unit: `createStaffRamp` seeding (Fridays, skip past), `computeRampScorecard` rows/targets/overall, checkpoint close transitions. Route tests: public check-in (404/429/idempotent/flag fan-out), checkpoint submit (403 non-manager, 400 bad ratings, close → PerformanceReview), both crons (401, lock skip, happy path), retention-checkins skip-with-ramp.
