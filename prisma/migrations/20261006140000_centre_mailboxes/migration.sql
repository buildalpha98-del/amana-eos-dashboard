-- Real coordinator mailboxes for each centre (Daniel, 2026-10-06). The
-- seeded addresses (arkana@, greenacre@ …) weren't the inboxes coordinators
-- actually log in with, so no centre account was ever recognised.
-- Stored lower-case; matching is case-insensitive anyway.
UPDATE "Service" SET "email" = 'kingsgrove@amanaoshc.com.au'        WHERE "code" = 'ARK';
UPDATE "Service" SET "email" = 'mfisgreenacre@amanaoshc.com.au'     WHERE "code" = 'MFIS-GA';
UPDATE "Service" SET "email" = 'mfisbh@amanaoshc.com.au'            WHERE "code" = 'MFIS-BH';
UPDATE "Service" SET "email" = 'mfishp@amanaoshc.com.au'            WHERE "code" = 'MFIS-HP';
UPDATE "Service" SET "email" = 'unitygrammar@amanaoshc.com.au'      WHERE "code" = 'UG';
UPDATE "Service" SET "email" = 'ic@amanaoshc.com.au'                WHERE "code" = 'IRF';
UPDATE "Service" SET "email" = 'minarahcollege@amanaoshc.com.au'    WHERE "code" = 'MNC';
UPDATE "Service" SET "email" = 'aiakkcc@amanaoshc.com.au'           WHERE "code" = 'AIA-COB';
UPDATE "Service" SET "email" = 'altaqwa@amanaoshc.com.au'           WHERE "code" = 'ATC';
UPDATE "Service" SET "email" = 'minaretdoveton@amanaoshc.com.au'    WHERE "code" = 'MIN-DOV';
UPDATE "Service" SET "email" = 'minaretspringvale@amanaoshc.com.au' WHERE "code" = 'MIN-SPR';
UPDATE "Service" SET "email" = 'minaretofficer@amanaoshc.com.au'    WHERE "code" = 'MIN-OFF';

-- Convert any existing login on those mailboxes into its centre account —
-- the same conversion as 20261006120000_user_centre_account (and
-- convertCentreMailboxUser): flag, clear induction, attach to the centre,
-- Educator → Director of Service (no other role touched).
UPDATE "User" u
SET "isCentreAccount"     = true,
    "inductionStatus"     = 'cleared',
    "inductionClearedAt"  = COALESCE(u."inductionClearedAt", NOW()),
    "inductionGraceUntil" = NULL,
    "serviceId"           = COALESCE(u."serviceId", s."id"),
    "role"                = CASE WHEN u."role" = 'staff' THEN 'member'::"Role" ELSE u."role" END
FROM "Service" s
WHERE s."email" IS NOT NULL
  AND lower(btrim(s."email")) = lower(btrim(u."email"))
  AND u."isCentreAccount" = false;

UPDATE "StaffRamp" r
SET "status" = 'ended', "completedAt" = COALESCE(r."completedAt", NOW())
FROM "User" u
WHERE r."userId" = u."id"
  AND u."isCentreAccount" = true
  AND r."status" IN ('active', 'extended');

UPDATE "Todo" t
SET "deleted" = true
FROM "User" u
WHERE t."assigneeId" = u."id"
  AND u."isCentreAccount" = true
  AND t."deleted" = false
  AND t."status" = 'pending'
  AND t."title" IN (
    'Complete your profile',
    'Upload your Working With Children Check',
    'Complete Mandatory Reporter Training (annual)',
    'Acknowledge the Child Safe Code of Conduct',
    'Review & acknowledge the Privacy Policy',
    'Review & acknowledge The Amana Way',
    'Set up your notification preferences',
    'Review your centre''s compliance status',
    'Explore the Getting Started guide'
  );
