-- Shift templates v1
-- Saved shift patterns admins use to create roster rows quickly
-- (Connecteam-style). Purely additive, no production data risk.

CREATE TABLE "ShiftTemplate" (
  "id"          TEXT NOT NULL,
  "serviceId"   TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "sessionType" "SessionType" NOT NULL,
  "shiftStart"  TEXT NOT NULL,
  "shiftEnd"    TEXT NOT NULL,
  "role"        TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,

  CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShiftTemplate_serviceId_label_key"
  ON "ShiftTemplate"("serviceId", "label");
CREATE INDEX "ShiftTemplate_serviceId_idx"
  ON "ShiftTemplate"("serviceId");

ALTER TABLE "ShiftTemplate"
  ADD CONSTRAINT "ShiftTemplate_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ShiftTemplate"
  ADD CONSTRAINT "ShiftTemplate_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
