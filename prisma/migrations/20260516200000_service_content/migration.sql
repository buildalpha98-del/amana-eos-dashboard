-- 2026-05-16: Per-service editable content overrides.
-- Holds About narrative, hero image URL, key contacts, daily routine notes,
-- food provider, parent onboarding text — the high-impact items from the
-- runtime-editability audit's per-service tier. Shape validated by Zod in
-- src/lib/service-content-shared.ts. Missing fields fall back to the
-- panel's hardcoded defaults so unset services keep rendering as today.

ALTER TABLE "Service"
  ADD COLUMN IF NOT EXISTS "content" JSONB;
