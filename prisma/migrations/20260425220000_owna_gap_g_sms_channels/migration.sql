-- OWNA Gap Close — Phase G (mass-messaging: SMS channel + opt-in)
--
-- Closes audit findings:
--   - "No SMS provider"
--   - "Broadcast is email-only + push (no SMS fallback)"
--
-- Adds multi-channel support to Broadcast and an explicit per-contact SMS
-- opt-in flag (Spam Act 2003 compliance — implied consent doesn't cover
-- bulk SMS).
--
-- Additive only.

-- ── Broadcast: channels + smsRecipientCount ─────────────────────
ALTER TABLE "Broadcast"
  ADD COLUMN "channels" TEXT[] NOT NULL DEFAULT ARRAY['email']::TEXT[],
  ADD COLUMN "smsRecipientCount" INTEGER NOT NULL DEFAULT 0;

-- ── CentreContact: SMS opt-in ───────────────────────────────────
ALTER TABLE "CentreContact"
  ADD COLUMN "smsOptIn" BOOLEAN NOT NULL DEFAULT false;
