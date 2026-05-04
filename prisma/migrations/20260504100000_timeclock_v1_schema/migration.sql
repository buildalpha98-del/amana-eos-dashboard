-- Timeclock v1 — schema additions
-- Spec: docs/superpowers/specs/2026-05-04-staff-timeclock-v1-design.md
-- Sub-PR 1 of 5; purely additive — no production data risk.

-- ── RosterShift: actual sign-in/out timestamps ──────────────
ALTER TABLE "RosterShift"
  ADD COLUMN "actualStart" TIMESTAMP(3),
  ADD COLUMN "actualEnd"   TIMESTAMP(3);

-- ── User: kiosk PIN (4-digit, bcrypt-hashed) ────────────────
ALTER TABLE "User"
  ADD COLUMN "kioskPinHash"  TEXT,
  ADD COLUMN "kioskPinSetAt" TIMESTAMP(3);

-- ── Kiosk: paired-tablet model ──────────────────────────────
CREATE TABLE "Kiosk" (
  "id"          TEXT NOT NULL,
  "serviceId"   TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "createdById" TEXT,
  "revokedAt"   TIMESTAMP(3),
  "lastSeenAt"  TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Kiosk_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Kiosk_serviceId_idx" ON "Kiosk"("serviceId");
CREATE INDEX "Kiosk_revokedAt_idx" ON "Kiosk"("revokedAt");

ALTER TABLE "Kiosk"
  ADD CONSTRAINT "Kiosk_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Kiosk"
  ADD CONSTRAINT "Kiosk_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
