-- ============================================================
-- QR management hub — replace activation-bound QRs with a standalone
-- QrCode model that supports per-QR labels, optional activation/service
-- linkage, and richer scan tracking (incl. geolocation).
-- ============================================================

-- CreateTable QrCode
CREATE TABLE "QrCode" (
    "id" TEXT NOT NULL,
    "shortCode" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "destinationUrl" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "activationId" TEXT,
    "serviceId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "QrCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable QrScan
CREATE TABLE "QrScan" (
    "id" TEXT NOT NULL,
    "qrCodeId" TEXT NOT NULL,
    "scannedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ipHash" TEXT,
    "userAgent" TEXT,
    "referrer" TEXT,
    "country" TEXT,
    "region" TEXT,
    "city" TEXT,

    CONSTRAINT "QrScan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "QrCode_shortCode_key" ON "QrCode"("shortCode");
CREATE INDEX "QrCode_active_idx" ON "QrCode"("active");
CREATE INDEX "QrCode_activationId_idx" ON "QrCode"("activationId");
CREATE INDEX "QrCode_serviceId_idx" ON "QrCode"("serviceId");
CREATE INDEX "QrCode_createdById_idx" ON "QrCode"("createdById");
CREATE INDEX "QrScan_qrCodeId_scannedAt_idx" ON "QrScan"("qrCodeId", "scannedAt");

-- AddForeignKey
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_activationId_fkey" FOREIGN KEY ("activationId") REFERENCES "CampaignActivationAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QrCode" ADD CONSTRAINT "QrCode_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "QrScan" ADD CONSTRAINT "QrScan_qrCodeId_fkey" FOREIGN KEY ("qrCodeId") REFERENCES "QrCode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────
-- Data migration: any existing activation-bound QRs become
-- standalone QrCode rows linked back to the activation.
-- ──────────────────────────────────────────────────────────
INSERT INTO "QrCode" ("id", "shortCode", "name", "destinationUrl", "active", "activationId", "serviceId", "createdAt", "updatedAt")
SELECT
  'qr_' || a."id",
  a."qrShortCode",
  COALESCE(c."name", 'Activation QR') || ' — ' || s."name",
  COALESCE(NULLIF(a."qrDestinationUrl", ''), 'https://amanaoshc.company/enquire?serviceId=' || a."serviceId"),
  TRUE,
  a."id",
  a."serviceId",
  a."createdAt",
  a."updatedAt"
FROM "CampaignActivationAssignment" a
JOIN "MarketingCampaign" c ON c."id" = a."campaignId"
JOIN "Service" s ON s."id" = a."serviceId"
WHERE a."qrShortCode" IS NOT NULL;

-- Migrate ActivationScan rows → QrScan rows.
INSERT INTO "QrScan" ("id", "qrCodeId", "scannedAt", "ipHash", "userAgent", "referrer")
SELECT
  'qrs_' || sc."id",
  'qr_' || sc."activationId",
  sc."scannedAt",
  sc."ipHash",
  sc."userAgent",
  sc."referrer"
FROM "ActivationScan" sc
WHERE EXISTS (SELECT 1 FROM "QrCode" q WHERE q."id" = 'qr_' || sc."activationId");

-- ──────────────────────────────────────────────────────────
-- Drop the old activation-bound QR fields + ActivationScan table.
-- ──────────────────────────────────────────────────────────
DROP TABLE "ActivationScan";

DROP INDEX IF EXISTS "CampaignActivationAssignment_qrShortCode_key";
ALTER TABLE "CampaignActivationAssignment"
  DROP COLUMN IF EXISTS "qrShortCode",
  DROP COLUMN IF EXISTS "qrDestinationUrl";
