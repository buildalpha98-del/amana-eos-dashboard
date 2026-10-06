-- Centre accounts: shared centre mailboxes (arkana@amanaoshc.com.au …) are
-- not people. They get full access to their own centre and are never put
-- through onboarding, induction, the 90-day ramp or rostering.

ALTER TABLE "User" ADD COLUMN "isCentreAccount" BOOLEAN NOT NULL DEFAULT false;

-- Mark existing centre mailboxes: any user whose email is a centre's email.
-- They are attached to that centre (only if unattached) and given
-- Director-of-Service access (Educator accounts only — no other role is
-- touched, so nothing is ever downgraded).
UPDATE "User" u
SET "isCentreAccount"      = true,
    "inductionStatus"      = 'cleared',
    "inductionClearedAt"   = COALESCE(u."inductionClearedAt", NOW()),
    "inductionGraceUntil"  = NULL,
    "serviceId"            = COALESCE(u."serviceId", s."id"),
    "role"                 = CASE
                               -- Educator → Director of Service. Every
                               -- other role is left alone: `eos` is already
                               -- admin-tier, so "upgrading" it would be a
                               -- downgrade.
                               WHEN u."role" = 'staff' THEN 'member'::"Role"
                               ELSE u."role"
                             END
FROM "Service" s
WHERE s."email" IS NOT NULL
  AND btrim(s."email") <> ''
  AND lower(btrim(s."email")) = lower(btrim(u."email"));

-- Stop the 90-day ramp's weekly check-in emails to centre mailboxes.
UPDATE "StaffRamp" r
SET "status" = 'ended', "completedAt" = COALESCE(r."completedAt", NOW())
FROM "User" u
WHERE r."userId" = u."id"
  AND u."isCentreAccount" = true
  AND r."status" IN ('active', 'extended');

-- Remove the auto-seeded "new starter" onboarding todos they never started.
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
