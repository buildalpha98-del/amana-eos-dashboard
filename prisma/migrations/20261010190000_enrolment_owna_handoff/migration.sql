-- CreateTable
CREATE TABLE "EnrolmentOwnaHandoff" (
    "enrolmentId" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EnrolmentOwnaHandoff_pkey" PRIMARY KEY ("enrolmentId")
);

-- AddForeignKey
ALTER TABLE "EnrolmentOwnaHandoff" ADD CONSTRAINT "EnrolmentOwnaHandoff_enrolmentId_fkey" FOREIGN KEY ("enrolmentId") REFERENCES "EnrolmentSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Persist invalidation across lifecycle round trips, including OWNA imports.
-- Keep staff evidence for review; a new revision prevents stale saves.
CREATE FUNCTION invalidate_owna_handoff(target_id TEXT) RETURNS void AS $$
BEGIN
  UPDATE "EnrolmentOwnaHandoff"
  SET "state" = jsonb_set("state", '{placement}', to_jsonb('invalidated:' || ("revision" + 1)::text)),
      "revision" = "revision" + 1, "updatedAt" = CURRENT_TIMESTAMP
  WHERE "enrolmentId" = target_id;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION child_owna_handoff_changed() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM invalidate_owna_handoff(NEW."enrolmentId");
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM invalidate_owna_handoff(OLD."enrolmentId");
  ELSIF OLD."serviceId" IS DISTINCT FROM NEW."serviceId"
     OR OLD."status" IS DISTINCT FROM NEW."status"
     OR OLD."enrolmentId" IS DISTINCT FROM NEW."enrolmentId"
     OR OLD."bookingPrefs" IS DISTINCT FROM NEW."bookingPrefs" THEN
    PERFORM invalidate_owna_handoff(OLD."enrolmentId");
    IF OLD."enrolmentId" IS DISTINCT FROM NEW."enrolmentId" THEN
      PERFORM invalidate_owna_handoff(NEW."enrolmentId");
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER child_owna_handoff_changed AFTER INSERT OR UPDATE OR DELETE ON "Child"
FOR EACH ROW EXECUTE FUNCTION child_owna_handoff_changed();

CREATE FUNCTION enrolment_owna_handoff_changed() RETURNS trigger AS $$
BEGIN
  IF OLD."status" IS DISTINCT FROM NEW."status" OR OLD."serviceId" IS DISTINCT FROM NEW."serviceId" THEN
    PERFORM invalidate_owna_handoff(NEW."id");
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER enrolment_owna_handoff_changed AFTER UPDATE ON "EnrolmentSubmission"
FOR EACH ROW EXECUTE FUNCTION enrolment_owna_handoff_changed();
