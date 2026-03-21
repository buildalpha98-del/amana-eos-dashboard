# OWNA Tier 1 Sync — Children, Attendance, Enquiries

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the OWNA client to match the real API, then sync children, per-child attendance, and enquiries into existing dashboard models — making the services tab feel alive with real data.

**Architecture:** The existing `OwnaClient` has incorrect URL paths (custom paths that don't match OWNA's actual REST API). We rewrite it to call the real endpoints (`/api/centre/list`, `/api/children/{centreId}/list`, `/api/attendance/{centreId}/{start}/{end}`, `/api/enquiries/{centreId}/list`). The sync cron expands from 3 data types to 6 (existing attendance/bookings/roster + new children/enquiries/incidents). Services map to OWNA via `ownaServiceId` which stores the OWNA `centreId`. New env var `OWNA_API_KEY` defaults to test key in development.

**Tech Stack:** Next.js API routes, Prisma ORM, OWNA REST API (x-api-key header auth), Vercel cron

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `src/lib/owna.ts` | **Rewrite** | OWNA API client — correct URL paths, real response types, x-api-key auth |
| `prisma/schema.prisma` | **Modify** | Add `ownaChildId` to Child, `ownaEnquiryId` to ParentEnquiry |
| `src/app/api/cron/owna-sync/route.ts` | **Modify** | Add children, enquiry, and incident sync to existing cron |
| `src/app/api/owna/centres/route.ts` | **Create** | GET endpoint to list OWNA centres (for mapping UI) |
| `src/app/api/owna/test/route.ts` | **Create** | GET endpoint to test API connectivity |

---

## Task 1: Rewrite OWNA Client to Match Real API

**Files:**
- Modify: `src/lib/owna.ts`

The existing client uses wrong URL paths and wrong auth header. The real OWNA API uses:
- Base URL: `https://api.owna.com.au`
- Auth: `x-api-key` header (not Bearer token)
- Paths: `/api/centre/list`, `/api/children/{centreId}/list`, etc.
- Response wrapper: `{ data: T[], totalCount: number, errors: null }`

- [ ] **Step 1: Rewrite owna.ts with correct API paths and types**

Replace entire file with client that matches real OWNA API:
- Fix auth header from `Authorization: Bearer` to `x-api-key`
- Add real response types matching actual JSON shapes (from API testing)
- Add methods: `getCentres()`, `getChildren(centreId)`, `getAttendance(centreId, start, end)`, `getEnquiries(centreId)`, `getStaff(centreId)`, `getRooms(centreId)`, `getIncidents(centreId, start, end)`, `getFamilies(centreId)`
- Keep existing retry + rate-limit logic
- Response types from actual API testing:
  - Centre: `{ name, alias, address, suburb, state, postcode, email, phone, children, capacity, serviceType, id }`
  - Child: `{ firstname, middlename, surname, dob, gender, crn, room, roomId, centreId, attending, parentIds, monday-sunday booleans, medical fields, indigenous, id }`
  - Attendance: `{ child, childId, room, roomId, centreId, attending, signIn, signOut, attendanceDate, sessionOfCare, fee, id }`
  - Enquiry: `{ firstname, surname, phone, email, enquiry, child1, child1Dob, status, centreid, id, dateAdded }`
  - Incident: `{ childId, child, centreId, staffName, incidentDate, location, injurytrauma, actionTaken, severity fields, id }`

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/lib/owna.ts
git commit -m "refactor: rewrite OWNA client to match real API endpoints and auth"
```

---

## Task 2: Add OWNA Fields to Prisma Schema

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add ownaChildId to Child model**

Add `ownaChildId String?` with unique index to Child model.
Add `ownaRoomId String?` and `ownaRoomName String?` fields.

- [ ] **Step 2: Add ownaEnquiryId to ParentEnquiry model**

Add `ownaEnquiryId String?` with unique index.

- [ ] **Step 3: Push schema changes**

Run: `npx prisma db push`

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "schema: add ownaChildId, ownaEnquiryId for OWNA sync"
```

---

## Task 3: Expand Cron Sync — Children

**Files:**
- Modify: `src/app/api/cron/owna-sync/route.ts`

- [ ] **Step 1: Add children sync block after existing roster sync**

For each service with `ownaServiceId`:
1. Call `owna.getChildren(centreId)` with `attending=true`
2. For each child record from OWNA:
   - Upsert into `Child` model matching on `ownaChildId`
   - Map fields: firstname→firstName, surname→surname, dob→dob, gender→gender, crn→crn
   - Map room info: room→ownaRoomName, roomId→ownaRoomId
   - Map booking days: monday-sunday booleans → bookingPrefs JSON
   - Map medical: indigenous, disabilities, practitioners → medical JSON
   - Set status to "active" for attending children
   - Set serviceId from current service
3. Mark children NOT in OWNA response as "withdrawn" (if they have ownaChildId and aren't in the response)

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/owna-sync/route.ts
git commit -m "feat: sync children from OWNA into Child model"
```

---

## Task 4: Expand Cron Sync — Per-Child Attendance

**Files:**
- Modify: `src/app/api/cron/owna-sync/route.ts`

The existing attendance sync stores AGGREGATE counts (enrolled: 20, attended: 18). The real OWNA API returns PER-CHILD attendance records (child X signed in at 7:02, signed out at 6:15). Both are useful.

- [ ] **Step 1: Update attendance sync to use real OWNA endpoint**

The current sync calls `owna.getAttendance(serviceCode, today, today)` expecting aggregate `OwnaAttendanceRecord`. The real API returns per-child records. Update to:
1. Call real endpoint: `owna.getAttendance(centreId, today, today)`
2. Get per-child attendance records
3. Aggregate into DailyAttendance (existing model): count attending vs absent, group by date
4. Store per-child sign-in/sign-out as needed (future enhancement)

This keeps backward compatibility with existing attendance tab while using the real API.

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/owna-sync/route.ts
git commit -m "feat: attendance sync uses real OWNA per-child endpoint"
```

---

## Task 5: Expand Cron Sync — Enquiries

**Files:**
- Modify: `src/app/api/cron/owna-sync/route.ts`

- [ ] **Step 1: Add enquiry sync block**

For each service with `ownaServiceId`:
1. Call `owna.getEnquiries(centreId)`
2. For each enquiry from OWNA:
   - Upsert into `ParentEnquiry` matching on `ownaEnquiryId`
   - Map: firstname+surname → parentName, email → parentEmail, phone → parentPhone
   - Map: child1 → childName, child1Dob → childAge (calculate from DOB)
   - Map: status → stage (OWNA "Tour Booked" → "nurturing", null → "new_enquiry")
   - Map: dateAdded → createdAt (only on create, not update)
   - Set channel to "website" for OWNA-sourced enquiries
   - Set serviceId from current service

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/owna-sync/route.ts
git commit -m "feat: sync enquiries from OWNA into ParentEnquiry model"
```

---

## Task 6: Expand Cron Sync — Incidents

**Files:**
- Modify: `src/app/api/cron/owna-sync/route.ts`

- [ ] **Step 1: Add incident sync block**

For each service with `ownaServiceId`:
1. Call `owna.getIncidents(centreId, startOfMonth, today)` — last 30 days
2. For each incident from OWNA:
   - Upsert into `IncidentRecord` matching on `ownaIncidentId`
   - Map: incidentDate, child (name), location, injurytrauma→description
   - Map: actionTaken, emergencyServices→reportableToAuthority
   - Map: parentNotified (boolean from parentNotifiedDatetime presence)
   - Map severity from OWNA fields: emergencyServices=true → "serious", medicalAttention=true → "moderate", else "minor"
   - Set serviceId from current service

- [ ] **Step 2: Verify build passes**

Run: `npm run build`

- [ ] **Step 3: Commit**

```bash
git add src/app/api/cron/owna-sync/route.ts
git commit -m "feat: sync incidents from OWNA into IncidentRecord model"
```

---

## Task 7: OWNA Centres List Endpoint + Test Endpoint

**Files:**
- Create: `src/app/api/owna/centres/route.ts`
- Create: `src/app/api/owna/test/route.ts`

- [ ] **Step 1: Create centres list endpoint**

`GET /api/owna/centres` — owner/admin only. Calls `owna.getCentres()` and returns the list. Used by the settings mapping UI to show available OWNA centres to map to.

- [ ] **Step 2: Create test connectivity endpoint**

`GET /api/owna/test` — owner/admin only. Calls `owna.getCentres()` and returns `{ connected: true, centreCount: N }` or error. Quick way to verify the API key works.

- [ ] **Step 3: Verify build passes**

Run: `npm run build`

- [ ] **Step 4: Commit**

```bash
git add src/app/api/owna/centres/route.ts src/app/api/owna/test/route.ts
git commit -m "feat: OWNA centres list and connectivity test endpoints"
```

---

## Task 8: Environment Config

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Add OWNA env vars to .env.example**

```
# OWNA Childcare API
OWNA_API_URL=https://api.owna.com.au
OWNA_API_KEY=63db089ff821163db089ff82114abf9e  # Test key — replace with production key
```

- [ ] **Step 2: Commit**

```bash
git add .env.example
git commit -m "config: add OWNA API env vars to .env.example"
```

---

## Task 9: Final Build + Push

- [ ] **Step 1: Full build verification**

Run: `npm run build`

- [ ] **Step 2: Push all commits**

Run: `git push origin main`

---

## Post-Implementation Notes

**What this enables:**
- Children page (`/children`) auto-populates with real OWNA data
- Enquiries page auto-populates with OWNA enquiries
- Incidents page auto-populates with OWNA incident reports
- Attendance tab gets real per-child data aggregated into existing format
- Settings → OWNA mapping can list real centres to map

**What still needs production key for:**
- Financial data (CCS payments, invoices, transactions)
- Casual bookings with real centre data
- Staff sync with real employee records

**Test key defaults:**
- `OWNA_API_URL` = `https://api.owna.com.au`
- `OWNA_API_KEY` = test key (2 demo centres: Sunnyside + Sunnyside DEMO)
- When OWNA provides production key, swap `OWNA_API_KEY` env var in Vercel
