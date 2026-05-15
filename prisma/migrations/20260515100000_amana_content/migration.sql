-- 2026-05-15: AmanaContent — editable content overrides for the
-- "The Amana Way" and "Educators Handbook" tools.
--
-- `key` is the panel slug (e.g. "amana-way" or "amana-handbook").
-- `data` is a flat JSON object: { "<wrapper-key>": "<override value>", ... }.
-- The wrapper keys are produced by `<E k="...">` etc. inside the panel
-- React components. Missing keys fall back to the hardcoded defaults in
-- the wrappers, so an empty table yields byte-identical rendering.

CREATE TABLE "AmanaContent" (
  "key"          TEXT NOT NULL,
  "data"         JSONB NOT NULL DEFAULT '{}'::jsonb,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "updatedById"  TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "AmanaContent_pkey" PRIMARY KEY ("key")
);

ALTER TABLE "AmanaContent"
  ADD CONSTRAINT "AmanaContent_updatedById_fkey"
  FOREIGN KEY ("updatedById") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
