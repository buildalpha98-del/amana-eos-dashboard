# Dashboard Improvements Sprint — Design Spec

## Scope

10 improvement areas across the Amana EOS Dashboard, ordered by effort/impact.

## 1. Quick Wins

### 1a. Dev Console Log Cleanup
- Remove `[DEV]` prefixed console.log statements from production API routes
- Files: tickets/[id]/route.ts, auth/forgot-password/route.ts

### 1b. Confirm Dialog Consistency
- `ConfirmDialog.tsx` already exists in `src/components/ui/`
- Replace `window.confirm()` calls with `<ConfirmDialog>` component
- Target: ServiceProgramTab.tsx and any others using native confirm

## 2. Policies Management Page (NEW)

**Backend**: Complete (5 API routes, Policy + PolicyAcknowledgement models)

### Page: `/policies`
- **Nav**: Operations section, Shield icon
- **Roles**: owner, head_office, admin, coordinator, member, staff (view); owner/head_office/admin (manage)
- **Layout**: Two tabs — "Policies" (list + CRUD) and "Compliance" (acknowledgement tracking)

**Policies Tab:**
- Filter pills: All, Draft, Published, Archived (admin only sees draft/archived)
- Category filter dropdown
- Table: title, version, status badge, category, acknowledgement count, actions
- Create/Edit modal: title, description, category, documentUrl, status, requiresReack toggle
- Slide-over detail panel: full policy + acknowledgement list + "Acknowledge" button for current user

**Compliance Tab (admin only):**
- Fetches GET /api/policies/compliance
- Table: policy title, version, total staff, acknowledged, pending, compliance rate bar
- Color-coded: green >90%, yellow 70-90%, red <70%

**Hook**: `src/hooks/usePolicies.ts` — usePolicies, usePolicy, useCreatePolicy, useUpdatePolicy, useDeletePolicy, useAcknowledgePolicy, usePolicyCompliance, useMyPendingPolicies

## 3. Incidents Dashboard Page (NEW)

**Backend**: Complete (4 API routes including trends, IncidentRecord model)

### Page: `/incidents`
- **Nav**: Operations section, AlertTriangle icon
- **Roles**: owner, head_office, admin, coordinator, member

**Layout**: Summary stats + filters + table + trends

**Stats Row:**
- Total incidents (period), Reportable count, Follow-up pending, Week-on-week change with trend arrow

**Filters:**
- Service, Type (8 types), Severity (4 levels), Date range
- Summary toggle (switches between list and aggregate view)

**List View:**
- Table: date, service, child name, type badge, severity badge, parent notified, reportable flag, follow-up status
- Click to expand: description, action taken, notes

**Trends View (from /api/incidents/trends):**
- Weekly trend line chart (simple bars, no chart library needed — CSS bars)
- Flagged centres callout cards
- Distribution breakdowns: by type, severity, location, time of day

**Hook**: `src/hooks/useIncidents.ts` — useIncidents, useIncidentTrends, useCreateIncident

## 4. Exit Surveys Dashboard (NEW)

**Backend**: Complete (summary endpoint with aggregated data)

### Integration: New tab on `/onboarding` page OR standalone section
- Fetches GET /api/exit-survey/summary
- Per-service cards: total exits, avg satisfaction (star rating), would-return rate, reason distribution (horizontal bar)
- Churn rate card: withdrawn vs active contacts
- Recent comments list
- "Trigger Exit Survey" button: modal with service, contact, child name, email fields

**Hook**: `src/hooks/useExitSurveys.ts` — useExitSurveySummary, useTriggerExitSurvey

## 5. Conversions UI Enhancement

**Page exists** at `/conversions` — already functional with status tabs, filters, revenue calculator.

**Improvements:**
- Add trend indicators showing conversion rate over time
- Add a simple funnel visualization (identified → contacted → converted)
- Mobile responsive pass (cards instead of table on mobile)

## 6. Mobile Responsive Pass

Apply `sm:` breakpoint patterns to pages that lack them:
- Enquiries: ensure kanban scrolls horizontally on mobile
- CRM: card layout on mobile instead of table
- Marketing: responsive tab navigation

## 7. Offboarding + Exit Survey Integration

**Page exists** at `/onboarding` with offboarding section.

**Improvements:**
- Add "Trigger Exit Survey" button on offboarding assignment
- Show exit survey status in offboarding progress view
- Link completed surveys to the offboarding record

## 8. Marketing Campaign Analytics

**Existing**: Campaign send via Brevo, template management

**Add:**
- Campaign history table with send date, recipient count, open rate (if Brevo provides)
- Per-template usage count
- Simple send activity timeline

## 9. Dual Nurture System Cleanup

**Current**: Legacy ParentNurtureStep + new SequenceStepExecution run in parallel.

**Action**: Mark legacy as deprecated in code comments, add migration path documentation. Full removal is too risky without data migration — defer to separate ticket.

## 10. Notifications Enhancement

**Existing**: NotificationDropdown + preferences

**Add:**
- Notification count badge in nav
- Mark all as read button
- Notification grouping by type (policy, task, system)

## Implementation Order

1. Quick wins (console logs, confirm dialogs) — 20 min
2. Policies page — 90 min
3. Incidents page — 90 min
4. Exit Surveys — 45 min
5. Conversions enhancement — 30 min
6. Mobile responsive — 45 min
7. Offboarding integration — 30 min
8. Marketing analytics — 45 min
9. Nurture cleanup — 15 min
10. Notifications — 30 min

Total estimated: ~7 hours. Will prioritize 1-6 and do 7-10 as time allows.
