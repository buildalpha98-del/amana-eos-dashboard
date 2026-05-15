-- AmanaWayContent: owner/admin-editable overrides for the
-- in-app Amana Way handbook. Singleton row, id = "singleton".

CREATE TABLE "AmanaWayContent" (
  "id"          TEXT         NOT NULL DEFAULT 'singleton',
  "data"        JSONB        NOT NULL DEFAULT '{}',
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmanaWayContent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AmanaWayContent"
  ADD CONSTRAINT "AmanaWayContent_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
