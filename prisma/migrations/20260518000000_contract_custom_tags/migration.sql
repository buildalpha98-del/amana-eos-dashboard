-- 2026-05-18: ContractCustomTag — org-level user-defined merge tags for
-- the contract template editor. Appear in the right-sidebar
-- MergeTagPanel under "Custom Tags" alongside the hardcoded system
-- catalog (staff/service/contract/manager/system). Single-tenant
-- semantics: one shared list across all admins. `createdById` is set
-- to NULL when the creator is deleted (audit-only foreign key).

CREATE TABLE "ContractCustomTag" (
  "id"          TEXT         NOT NULL,
  "key"         TEXT         NOT NULL,
  "label"       TEXT         NOT NULL,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ContractCustomTag_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ContractCustomTag_key_key" ON "ContractCustomTag"("key");
CREATE INDEX "ContractCustomTag_key_idx" ON "ContractCustomTag"("key");

ALTER TABLE "ContractCustomTag"
  ADD CONSTRAINT "ContractCustomTag_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
