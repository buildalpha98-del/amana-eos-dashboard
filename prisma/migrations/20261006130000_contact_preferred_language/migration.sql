-- Preferred language per family, for language-targeted marketing and the
-- per-centre language breakdown. Values are the PREFERRED_LANGUAGES labels
-- in src/lib/languages.ts.

ALTER TABLE "CentreContact" ADD COLUMN "preferredLanguage" VARCHAR(60);
CREATE INDEX "CentreContact_serviceId_preferredLanguage_idx"
  ON "CentreContact"("serviceId", "preferredLanguage");

-- Backfill PRIMARY carers from their enrolment. Families who enrolled
-- before the dropdown only told us "language spoken at home" (free text),
-- so map it the same way languageFromText() does: first non-English
-- language mentioned wins, plain English → English, anything else → Other.
WITH src AS (
  SELECT DISTINCT ON (c."id")
    c."id" AS contact_id,
    lower(COALESCE(
      NULLIF(btrim(e."primaryParent"->>'preferredLanguage'), ''),
      NULLIF(btrim(e."primaryParent"->>'languageSpoken'), '')
    )) AS t
  FROM "CentreContact" c
  JOIN "EnrolmentSubmission" e
    ON e."id" = c."sourceEnrolmentId"
    OR (lower(e."primaryParent"->>'email') = lower(c."email") AND e."serviceId" = c."serviceId")
  WHERE c."preferredLanguage" IS NULL
    AND COALESCE(c."parentRole", 'primary') = 'primary'
  ORDER BY c."id", e."createdAt" DESC
)
UPDATE "CentreContact" c
SET "preferredLanguage" = CASE
    WHEN src.t ~ 'arab' THEN 'Arabic'
    WHEN src.t ~ 'urdu' THEN 'Urdu'
    WHEN src.t ~ 'turk' THEN 'Turkish'
    WHEN src.t ~ '(bangla|bengali)' THEN 'Bangla'
    WHEN src.t ~ 'somal' THEN 'Somali'
    WHEN src.t ~ '(pasht|pusht)' THEN 'Pashto'
    WHEN src.t ~ '(dari|farsi|persian)' THEN 'Dari / Persian'
    WHEN src.t ~ 'hindi' THEN 'Hindi'
    WHEN src.t ~ '(indones|bahasa)' THEN 'Indonesian'
    WHEN src.t ~ 'malay' THEN 'Malay'
    WHEN src.t ~ 'vietnam' THEN 'Vietnamese'
    WHEN src.t ~ 'mandarin' THEN 'Chinese (Mandarin)'
    WHEN src.t ~ 'cantonese' THEN 'Chinese (Cantonese)'
    WHEN src.t ~ '(tagalog|filipin)' THEN 'Filipino (Tagalog)'
    WHEN src.t ~ 'samoa' THEN 'Samoan'
    WHEN src.t ~ 'english' THEN 'English'
    ELSE 'Other'
  END
FROM src
WHERE c."id" = src.contact_id
  AND src.t IS NOT NULL;
