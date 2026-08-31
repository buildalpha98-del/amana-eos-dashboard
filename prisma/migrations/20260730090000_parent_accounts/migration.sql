-- 2026-07-30: parent accounts (Phase 1 of the enrolment re-architecture).
--
-- Purely additive: no existing table is touched and no data is moved.
-- Parents keep signing in by magic link until they claim an account, so
-- deploying this changes nothing for anyone already using the portal.
CREATE TABLE IF NOT EXISTS "ParentAccount" (
  "id"              TEXT PRIMARY KEY,
  "email"           TEXT NOT NULL,
  "passwordHash"    TEXT NOT NULL,
  "emailVerifiedAt" TIMESTAMP(3),
  "firstName"       TEXT,
  "surname"         TEXT,
  "claimedAt"       TIMESTAMP(3),
  "lastLoginAt"     TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "ParentAccount_email_key" ON "ParentAccount"("email");
CREATE INDEX IF NOT EXISTS "ParentAccount_email_idx" ON "ParentAccount"("email");

CREATE TABLE IF NOT EXISTS "ParentEmailVerification" (
  "id"        TEXT PRIMARY KEY,
  "accountId" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "usedAt"    TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ParentEmailVerification_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "ParentAccount"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "ParentEmailVerification_tokenHash_key" ON "ParentEmailVerification"("tokenHash");
CREATE INDEX IF NOT EXISTS "ParentEmailVerification_accountId_idx" ON "ParentEmailVerification"("accountId");
CREATE INDEX IF NOT EXISTS "ParentEmailVerification_tokenHash_idx" ON "ParentEmailVerification"("tokenHash");
