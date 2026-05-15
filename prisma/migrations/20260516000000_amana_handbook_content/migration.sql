-- 2026-05-16: AmanaHandbookContent — owner/admin-editable overrides for the
-- Educators Induction Handbook (`/tools/handbook`). Mirrors AmanaWayContent's
-- singleton-row design (id = "singleton", data = JSON map of content-key →
-- override). Decoupled from AmanaWayContent so the two handbooks evolve
-- independently and overrides don't collide on shared default keys.

CREATE TABLE "AmanaHandbookContent" (
  "id"          TEXT         NOT NULL DEFAULT 'singleton',
  "data"        JSONB        NOT NULL DEFAULT '{}',
  "updatedById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AmanaHandbookContent_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AmanaHandbookContent"
  ADD CONSTRAINT "AmanaHandbookContent_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
