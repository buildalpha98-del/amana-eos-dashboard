-- A centre account belongs to exactly ONE centre: the one whose email it
-- is. The earlier conversions kept any centre the account was ALREADY
-- attached to (COALESCE), so a mailbox once attached to the wrong centre
-- stayed there — its sidebar showed the wrong centre, and its own centre's
-- budget (and every other own-centre check) refused it. Re-point every
-- centre account at its mailbox's centre.
UPDATE "User" u
SET "serviceId" = s."id"
FROM "Service" s
WHERE u."isCentreAccount" = true
  AND s."email" IS NOT NULL
  AND lower(btrim(s."email")) = lower(btrim(u."email"))
  AND u."serviceId" IS DISTINCT FROM s."id";
