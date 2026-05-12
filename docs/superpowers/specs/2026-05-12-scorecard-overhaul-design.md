# Scorecard architecture overhaul — design doc

Status: **approved by user 2026-05-12** ("follow what you think is best" + "keep going")
Owner: Jayden (project owner)
Tracking: Bucket O — 3 staged PRs

## Why

Reported by Jayden 2026-05-12 as part of the Issue 4 feedback:

> Currently, measurables are linked directly to a person. Instead, the
> scorecard itself should be the primary entity, with people and
> measurables attached to it.

The current model already has `Scorecard` as a top-level entity, but only
one ever exists (`"Weekly Leadership Scorecard"`, seed-created) and
`Measurable` is keyed to a `User` (`ownerId`) and a `Service` (`serviceId`)
rather than to a set of people invited into a particular scorecard.

Goals:
1. **Multiple scorecards** — leadership-team, per-centre, role-specific
   scorecards all coexist.
2. **Per-scorecard membership** — invite specific users into a scorecard;
   measurable owners must be members of the scorecard.
3. **Per-scorecard owner** — the creator owns the scorecard, can rename it,
   invite/remove members, and edit all its measurables.
4. **Drop "Select Centre"** from the measurable create flow — the scorecard
   is the scope, not the service.

## Open questions (decided)

1. **Who is a "scorecard owner"?**
   **Decision (b)**: the creator becomes the owner. Any admin-tier user
   (`owner`/`head_office`/`admin`) can create a scorecard. The dashboard
   `owner` role keeps super-admin access — sees all scorecards, can manage
   any. Per-scorecard owners only manage their own.
   *Why*: matches EOS practice where the Visionary/Integrator owns the L10
   scorecard, the Marketing lead owns the Marketing scorecard, etc.
   Centralised owner-only management would create a bottleneck.

2. **What happens to existing `Measurable.serviceId`?**
   **Decision (b)**: keep the column, stop writing it from the new
   measurable-create flow, hide it from the UI. Existing per-service
   measurables retain their service link so the `/leadership` per-service
   rollup keeps working historically. Future measurables will roll up by
   scorecard, not by service.
   *Why*: dropping the column would break the existing leadership rollup
   query without a migration to rebuild it. Keeping it is reversible (we
   can always drop it later once nothing reads it).

3. **What about the existing "Weekly Leadership Scorecard"?**
   **Decision (b)**: leave empty (no members), show a one-time banner to
   the dashboard owner saying "Invite members so they can see this
   scorecard." The owner backfills membership manually — they know who
   should be in it better than an auto-add would.
   *Why*: auto-adding all admin-tier users (option a) over-shares. A
   `head_office` State Manager doesn't necessarily want to see the
   nation-wide leadership scorecard.

## Architecture

### Schema changes (Stage 1)

```prisma
model Scorecard {
  id        String   @id @default(cuid())
  title     String
  ownerId   String                                         // NEW (NOT NULL after backfill)
  owner     User     @relation("ScorecardOwner", fields: [ownerId], references: [id])
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  measurables Measurable[]
  members     ScorecardMember[]                            // NEW

  @@index([ownerId])
}

model ScorecardMember {
  id          String    @id @default(cuid())
  scorecardId String
  scorecard   Scorecard @relation(fields: [scorecardId], references: [id], onDelete: Cascade)
  userId      String
  user        User      @relation("ScorecardMembership", fields: [userId], references: [id], onDelete: Cascade)
  addedAt     DateTime  @default(now())

  @@unique([scorecardId, userId])
  @@index([userId])
  @@index([scorecardId])
}

model Measurable {
  // ... unchanged fields
  // serviceId is KEPT but no longer populated on new rows from Stage 2 onward.
  // The route-level Zod schema for create no longer accepts serviceId in Stage 2.
}
```

### Migration

```sql
-- Step 1: add ownerId nullable so the backfill can populate it
ALTER TABLE "Scorecard" ADD COLUMN "ownerId" TEXT;

-- Step 2: backfill — point every existing scorecard at the first owner-role
-- user. There's always at least one (Jayden, hardcoded user id in
-- onboarding-seed.ts).
UPDATE "Scorecard"
SET "ownerId" = (SELECT "id" FROM "User" WHERE "role" = 'owner' ORDER BY "createdAt" ASC LIMIT 1)
WHERE "ownerId" IS NULL;

-- Step 3: lock it down — NOT NULL + FK
ALTER TABLE "Scorecard" ALTER COLUMN "ownerId" SET NOT NULL;
ALTER TABLE "Scorecard"
  ADD CONSTRAINT "Scorecard_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "User"("id");
CREATE INDEX "Scorecard_ownerId_idx" ON "Scorecard"("ownerId");

-- Step 4: create ScorecardMember
CREATE TABLE "ScorecardMember" (
  "id"          TEXT NOT NULL PRIMARY KEY,
  "scorecardId" TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "addedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScorecardMember_scorecardId_fkey"
    FOREIGN KEY ("scorecardId") REFERENCES "Scorecard"("id") ON DELETE CASCADE,
  CONSTRAINT "ScorecardMember_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE
);

CREATE UNIQUE INDEX "ScorecardMember_scorecardId_userId_key"
  ON "ScorecardMember"("scorecardId", "userId");
CREATE INDEX "ScorecardMember_userId_idx"  ON "ScorecardMember"("userId");
CREATE INDEX "ScorecardMember_scorecardId_idx" ON "ScorecardMember"("scorecardId");
```

### Permission helpers (Stage 1)

```ts
// src/lib/scorecard-permissions.ts

/** Dashboard owner sees everything; per-scorecard owner sees own;
 *  members see scorecards they've been invited to. */
export function canViewScorecard(viewer, scorecard, memberIds): boolean

/** Dashboard owner can manage any scorecard; per-scorecard owner can
 *  manage their own. No one else. */
export function canManageScorecard(viewer, scorecard): boolean
```

Pure, no DB access — caller passes the rows. Easy to unit test.

## Staging

| Stage | What ships | Behaviour change | Rollback |
|---|---|---|---|
| **1** (this PR) | Schema, migration, backfill, permission helpers, tests. **No route or UI changes.** | None — existing routes keep working with their current logic. The new columns/tables exist but are unused. | Drop the new column/table |
| **2** | API: `GET /api/scorecards`, `POST /api/scorecards`, member CRUD, ownership-gated measurable mutations, Zod drops `serviceId` from POST input. | Multiple scorecards now usable via API. Existing UI still works. | Revert routes — schema stays |
| **3** | UI: scorecard selector, create modal, invite-member modal, remove "Select Centre" field, "Invite members" banner on the orphan scorecard. | User-visible — multi-scorecard support. | Revert UI — API + schema stay |

## Out of scope

- Cross-scorecard rollup ("show me all measurables across scorecards I'm in") — future
- Scorecard archiving (soft delete) — future, can be added when needed
- Custom periods (only weekly today) — separate spec
- Removing `Measurable.serviceId` entirely — separate cleanup PR once the leadership rollup is rewritten
