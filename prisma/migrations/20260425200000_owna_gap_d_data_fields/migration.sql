-- OWNA Gap Close — Phase D (data fields)
--
-- Closes three audit findings against OWNA capability:
--   1. No custody / guardianship fields on Child
--   2. No immunisation cycle tracking (only free-text vaccinationStatus)
--   3. No legacy OWNA family ID mapping on CentreContact
--
-- All additive. Safe on existing rows (every column is nullable).

-- ── Child: custody + immunisation cycle ─────────────────────────
ALTER TABLE "Child"
  ADD COLUMN "nextImmunisationDue" DATE,
  ADD COLUMN "custodyArrangements" JSONB;

-- ── CentreContact: OWNA family ID (forward-looking; populated when family sync wires up) ──
ALTER TABLE "CentreContact"
  ADD COLUMN "ownaFamilyId" TEXT;

-- ── Indexes ─────────────────────────────────────────────────────
CREATE UNIQUE INDEX "CentreContact_ownaFamilyId_key" ON "CentreContact"("ownaFamilyId");

CREATE INDEX "Child_serviceId_nextImmunisationDue_idx" ON "Child"("serviceId", "nextImmunisationDue");
