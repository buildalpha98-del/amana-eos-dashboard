-- 2026-07-28: EOS quarters move from calendar year to the Australian
-- financial year (1 Jul – 30 Jun), per Daniel.
--
--   Q1 = Jul–Sep   Q2 = Oct–Dec   Q3 = Jan–Mar   Q4 = Apr–Jun
--
-- Labels are suffixed with the FY they belong to, named by the year the FY
-- ENDS: Jul 2026 – Jun 2027 is FY27.
--
-- Remap (lossless, 1:1 — no rock changes which three months it covers,
-- only what those months are called):
--   Q1-YYYY (Jan–Mar) → Q3-FY(YY)        e.g. Q1-2027 → Q3-FY27
--   Q2-YYYY (Apr–Jun) → Q4-FY(YY)        e.g. Q2-2027 → Q4-FY27
--   Q3-YYYY (Jul–Sep) → Q1-FY(YY+1)      e.g. Q3-2026 → Q1-FY27
--   Q4-YYYY (Oct–Dec) → Q2-FY(YY+1)      e.g. Q4-2026 → Q2-FY27
--
-- This mirrors calendarQuarterToFinancial() in src/lib/utils.ts exactly; a
-- property test (src/__tests__/lib/quarter-financial-year.test.ts) asserts
-- that remapping a legacy label equals labelling the same date afresh, so
-- the SQL and the runtime cannot drift apart.
--
-- Rock.quarter is the ONLY quarter-bearing column in the schema (verified),
-- so nothing else needs remapping.
--
-- The WHERE clause matches only legacy calendar labels, making this
-- re-runnable: rows already in "Qn-FYyy" form are untouched.
UPDATE "Rock"
SET "quarter" = CASE
  -- Jan–Mar / Apr–Jun: same FY, quarter number + 2
  WHEN "quarter" ~ '^Q[12]-[0-9]{4}$' THEN
    'Q'
    || (substring("quarter" from 2 for 1)::int + 2)::text
    || '-FY'
    || lpad(((right("quarter", 4)::int) % 100)::text, 2, '0')
  -- Jul–Sep / Oct–Dec: next FY, quarter number - 2
  WHEN "quarter" ~ '^Q[34]-[0-9]{4}$' THEN
    'Q'
    || (substring("quarter" from 2 for 1)::int - 2)::text
    || '-FY'
    || lpad(((right("quarter", 4)::int + 1) % 100)::text, 2, '0')
  ELSE "quarter"
END
WHERE "quarter" ~ '^Q[1-4]-[0-9]{4}$';
