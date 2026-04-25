-- Sprint 4 — Vendor & Printing SOP
-- Evolves the Sprint 2 VendorBrief stub into a real CRUD module + adds
-- VendorContact (Jinan + future external vendors) + TermReadinessCategory.
-- Non-destructive: adds columns and a new table.

-- ── Enum: TermReadinessCategory ─────────────────────────────────
CREATE TYPE "TermReadinessCategory" AS ENUM (
  'flyers',
  'banners',
  'signage',
  'holiday_programme_materials',
  'enrolment_posters',
  'other_print'
);

-- ── New table: VendorContact ────────────────────────────────────
CREATE TABLE "VendorContact" (
  "id"              TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "email"           TEXT,
  "phone"           TEXT,
  "company"         TEXT,
  "role"            TEXT,
  "defaultForTypes" "VendorBriefType"[] DEFAULT ARRAY[]::"VendorBriefType"[],
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "notes"           TEXT,
  "userId"          TEXT,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL,

  CONSTRAINT "VendorContact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "VendorContact_userId_key" ON "VendorContact"("userId");
CREATE INDEX "VendorContact_active_idx" ON "VendorContact"("active");

ALTER TABLE "VendorContact"
  ADD CONSTRAINT "VendorContact_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ── VendorBrief: new columns ────────────────────────────────────
ALTER TABLE "VendorBrief" ADD COLUMN "briefNumber" TEXT;
ALTER TABLE "VendorBrief" ADD COLUMN "vendorContactId" TEXT;
ALTER TABLE "VendorBrief" ADD COLUMN "briefBody" TEXT;
ALTER TABLE "VendorBrief" ADD COLUMN "specifications" TEXT;
ALTER TABLE "VendorBrief" ADD COLUMN "quantity" INTEGER;
ALTER TABLE "VendorBrief" ADD COLUMN "deliveryAddress" TEXT;
ALTER TABLE "VendorBrief" ADD COLUMN "termReadinessCategory" "TermReadinessCategory";
ALTER TABLE "VendorBrief" ADD COLUMN "termYear" INTEGER;
ALTER TABLE "VendorBrief" ADD COLUMN "termNumber" INTEGER;
ALTER TABLE "VendorBrief" ADD COLUMN "deliveryDeadline" TIMESTAMP(3);
ALTER TABLE "VendorBrief" ADD COLUMN "quoteApprovedAt" TIMESTAMP(3);
ALTER TABLE "VendorBrief" ADD COLUMN "installedAt" TIMESTAMP(3);
ALTER TABLE "VendorBrief" ADD COLUMN "escalationReason" TEXT;
ALTER TABLE "VendorBrief" ADD COLUMN "cancellationReason" TEXT;

-- Backfill briefNumber for any pre-existing test rows. After this we can
-- safely apply the unique constraint.
-- Postgres disallows window functions in UPDATE — use a numbered CTE.
WITH numbered AS (
  SELECT "id",
         ROW_NUMBER() OVER (ORDER BY "createdAt", "id") AS rn
  FROM "VendorBrief"
  WHERE "briefNumber" IS NULL
)
UPDATE "VendorBrief" v
SET "briefNumber" = 'VB-LEGACY-' || LPAD(numbered.rn::TEXT, 4, '0')
FROM numbered
WHERE v."id" = numbered."id";

ALTER TABLE "VendorBrief" ALTER COLUMN "briefNumber" SET NOT NULL;
CREATE UNIQUE INDEX "VendorBrief_briefNumber_key" ON "VendorBrief"("briefNumber");

ALTER TABLE "VendorBrief"
  ADD CONSTRAINT "VendorBrief_vendorContactId_fkey"
  FOREIGN KEY ("vendorContactId") REFERENCES "VendorContact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "VendorBrief_termYear_termNumber_termReadinessCategory_idx"
  ON "VendorBrief"("termYear", "termNumber", "termReadinessCategory");
CREATE INDEX "VendorBrief_vendorContactId_idx" ON "VendorBrief"("vendorContactId");
