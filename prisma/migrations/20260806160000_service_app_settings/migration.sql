-- Per-centre behaviour toggles. Nullable: every default is today's
-- behaviour, so an unset column changes nothing.
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "appSettings" JSONB;
