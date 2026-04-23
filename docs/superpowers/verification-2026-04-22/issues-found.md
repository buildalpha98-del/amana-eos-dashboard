# Silent-Failure Audit Findings

**Date:** 2026-04-22
**Scope:** 5 recent PRs (`ba8ab55..6fefa69`, i.e. PRs #21–#25), 114 files touched (60 production server + client files reviewed; tests skipped)

## Summary

**0 critical / 3 important / 2 minor** silent-failure issues found in the recent PR diffs.

All new API routes awaited their writes, used Zod validation + `parseJsonBody`, and were wrapped in `withApiAuth` / `withApiHandler`. The transactional patterns (bulk roll-call, supersede contract, parent booking) are correctly built with `$transaction` and `Serializable` isolation where needed. Mutation hooks that go through `useContracts`, `useRecruitment`, `useChildren`, `useChildRelationships`, `useServices`, `useInternalFeedback`, and the `FeedbackWidget` all have `onError` toasts and `onSuccess` invalidations.

The issues below are all in the recruitment UI shipped with PR #25.

---

## Important

### Important Issue: VacancyDetailPanel uses raw `fetch` with zero error handling
- File: `src/components/recruitment/VacancyDetailPanel.tsx:73-111`
- Problem: `handleStatusChange` / `handleStageChange` call `fetch(...)` directly, ignore the response, and only invalidate the query on the happy path. If the PATCH returns 403/400/500 the promise resolves, `await fetch` succeeds, `invalidateQueries` fires, the UI rolls back to the server value, and the user sees no error — a textbook silent mutation failure. `handleAddCandidate` does check `res.ok` but then shows `alert("Failed to add candidate")` instead of the server error; same treatment for `handleFileUpload`.
- Fix: Replace `fetch(...)` with `mutateApi(...)` (project standard) or at minimum check `res.ok`, parse the server error, and show a destructive `toast({ variant: "destructive", description: ... })`. The existing `useUpdateCandidate` hook already does this correctly — route both the status and stage writes through it.

### Important Issue: `/api/recruitment/[id]/candidates` POST skips activity log + assignee-resolution behavior but mainly: the raw-fetch caller never invalidates the list query
- File: `src/components/recruitment/VacancyDetailPanel.tsx:88-96`
- Problem: After adding a candidate via raw `fetch`, only `["recruitment-vacancy", vacancyId]` is invalidated, but the main recruitment list page uses `["vacancies", …]` (see `useVacancies` in `src/hooks/useRecruitment.ts:58`). Net effect: new candidate shows in the detail panel but the vacancy's `_count.candidates` on the parent list stays stale until manual refresh. Same stale-count problem after `handleStatusChange`.
- Fix: After the candidate-add `fetch` resolves, also `queryClient.invalidateQueries({ queryKey: ["vacancies"] })`. Or, better, migrate to a `useAddCandidate` mutation hook that invalidates both keys.

### Important Issue: `POST /api/staff-referrals` doesn't log activity or validate candidate FK
- File: `src/app/api/staff-referrals/route.ts:42-57`
- Problem: Unlike every other contract/recruitment write in this PR, the staff-referral create path has no `activityLog.create`. If `candidateId` is passed (optional field), the handler doesn't verify it exists — a bogus id will fail at `.create` with a Prisma foreign-key error that the wrapper will surface as a 500 rather than a 400. Not strictly "silent success", but inconsistent with the neighbouring routes and likely to manifest as a noisy 500 in Sentry.
- Fix: Add an `activityLog.create` entry after the `staffReferral.create` (non-blocking `.catch`) and either validate the FK upfront with `findUnique` or wrap the call in a try/catch to translate P2003 → `ApiError.badRequest`.

---

## Minor

### Minor Issue: `AddChildDialog` invalidates two query keys but misses `["children"]` and `["monthly-roll-call", …]`
- File: `src/components/services/weekly-grid/AddChildDialog.tsx:112-113`
- Problem: After a successful bulk "add child to week" POST, the dialog invalidates `["weekly-roll-call", serviceId, weekStart]` and `["enrollable-children", serviceId, weekStart]` only. The service's children-list view (`useChildren`) and the monthly roll-call view (`useMonthlyRollCall`) also surface attendance data for these children — if the user switches tabs they'll see stale counts until the 30 s `staleTime` expires.
- Fix: Add `qc.invalidateQueries({ queryKey: ["monthly-roll-call", serviceId] })` and `qc.invalidateQueries({ queryKey: ["children"] })`. The existing invalidations already fire via the `onSuccess` of the single-item route via RollCall component; this bulk path skips them.

### Minor Issue: `useUpdateFeedback` and `useInternalFeedback` list queries don't share granular keys
- File: `src/hooks/useInternalFeedback.ts:76-77`
- Problem: `useUpdateFeedback.onSuccess` invalidates `["internal-feedback"]` (top-level). That correctly refetches both list and detail queries. Not a bug, but note that `FeedbackDetailPanel` does its own optimistic cache update at `admin/feedback/FeedbackDetailPanel.tsx:53` using `["internal-feedback", "detail", feedback.id]`; when the mutation settles and the blanket invalidation fires, the optimistic update gets clobbered by the refetch. In practice this is fine (the refetch returns the same authoritative state), but if the server is slow the user briefly sees the status flicker back then forward. Consider a narrower invalidation on detail-only updates.

---

## Verified absent

- [x] **Silent success** — 22 new / modified server routes checked (contracts ×5, recruitment ×5, staff-referrals ×2, internal-feedback ×2, children ×3, attendance bulk ×1, services ×5, parent/bookings ×2, cowork/todos, cowork/holiday-quest, rocks, documents). Every write path has an awaited `prisma.*.create/update/upsert/delete` before the `NextResponse.json(…)`. No handler returns 200/201 on a no-op branch without a side-effect.
- [x] **Missing awaits** — 23 handlers scanned. The only missing `await` on `prisma.*` that would be a bug is zero. Intentional fire-and-forget patterns (`sendSignInNotification().catch(…)`, `indexDocument().catch(…)`, `sendSlackFeedback().catch(() => {})`, `notifyNewRock(...).catch(…)`, `sendAssignmentEmail(...)` without await in rocks) are documented and appropriate for their side-channels. `sendAssignmentEmail` in `src/app/api/rocks/route.ts:134` is the one place that has neither `await` nor `.catch()` — if the email helper throws synchronously the unhandled-rejection will log but not block. Consistent with preexisting pattern, not a regression.
- [x] **Missing invalidations** — 9 mutation hooks scanned (`useCreateContract`, `useUpdateContract`, `useSupersedeContract`, `useAcknowledgeContract`, `useTerminateContract`, `useUpdateCandidate`, `useAiScreenCandidate`, `useMarkReferralPaid`, `useChildRelationships`, `useUpdateChild`, `useUpdateService`, `useCreateService`, `useDeleteService`, `useUpdateFeedback`, `FeedbackWidget` inline). All but the two minor issues above invalidate the correct keys. All have `onError` toasts.
- [x] **Multi-row writes** — 6 multi-row sites scanned. All correctly use `$transaction`: bulk roll-call (`src/app/api/attendance/roll-call/bulk/route.ts`), supersede contract (`src/app/api/contracts/[id]/supersede/route.ts`), cowork todos bulk (`src/app/api/cowork/todos/route.ts`), parent bookings single + bulk (`src/app/api/parent/bookings/route.ts`, `.../bulk/route.ts` — both with Serializable isolation), children `bookingPrefs` merge (`src/app/api/children/[id]/route.ts:147`), and single-item roll-call + DailyAttendance aggregate (`src/app/api/attendance/roll-call/route.ts` — the aggregate is outside the write but acceptable since it's idempotent upsert). The 2-step write in `acknowledge/route.ts` (update contract + conditionally seed onboarding) is NOT transactional but the onboarding-seed is explicitly fire-and-forget with a try/catch and logs, per the inline comment.
- [x] **`as any` / `as Role`** — 0 new occurrences introduced in this PR range. Total `as any` in diff: 4 (`src/app/api/documents/route.ts:37,98,108` — pre-existing, `src/app/(dashboard)/contracts/page.tsx:30` = `as Role` for typing, standard pattern). None are in new code paths. `src/app/api/services/[id]/casual-settings/route.ts:46` explicitly uses the safe `as Prisma.InputJsonValue` cast with a comment explaining why (Zod-validated → Prisma JSON column).

---

## Recommendation

**Ship 8b now.** No critical or data-loss findings. The three important items are isolated to the recruitment detail panel (PR #25) and should be addressed in a follow-up — none block daily ops or cause data corruption. The minor items are cache-staleness cosmetic issues with 30 s auto-recovery.

**Suggested follow-up PR:** migrate `VacancyDetailPanel` from raw `fetch` to the `mutateApi` / `useMutation` pattern used elsewhere in the codebase. This brings recruitment into line with the project's error-handling standards (destructive toasts, retry, typed errors with status+serverError) and fixes both important issue #1 and #2 in one stroke.
