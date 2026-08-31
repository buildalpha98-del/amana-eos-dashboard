-- 2026-07-28: fingerprint of the question set (ids + options) served when a
-- quiz attempt starts. Nullable: existing/legacy attempts stay NULL and are
-- exempt from the mid-attempt-edit check; new attempts record it at GET and
-- submit 409s if the questions changed underneath the learner.
ALTER TABLE "LMSQuizAttempt" ADD COLUMN IF NOT EXISTS "optionsFingerprint" TEXT;
