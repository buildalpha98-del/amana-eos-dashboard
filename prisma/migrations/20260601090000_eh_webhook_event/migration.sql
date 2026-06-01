-- EH Payroll webhook audit table (2026-06-01)
--
-- Mirrors every HMAC-verified inbound webhook for forensic audit +
-- idempotent processing via the providerEventId unique constraint.

CREATE TABLE "EhWebhookEvent" (
  "id"               TEXT NOT NULL,
  "eventType"        VARCHAR(100) NOT NULL,
  "providerEventId"  VARCHAR(200),
  "payload"          JSONB NOT NULL,
  "receivedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "processedAt"      TIMESTAMP(3),
  "error"            TEXT,
  CONSTRAINT "EhWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "EhWebhookEvent_providerEventId_key"
  ON "EhWebhookEvent"("providerEventId");
CREATE INDEX "EhWebhookEvent_eventType_receivedAt_idx"
  ON "EhWebhookEvent"("eventType", "receivedAt");
CREATE INDEX "EhWebhookEvent_receivedAt_idx"
  ON "EhWebhookEvent"("receivedAt");
