-- Wire RecruitmentVacancy to the PositionDescription library (2026-06-01)
--
-- Nullable FK so legacy vacancies created before this migration
-- continue to work. On PD delete, the vacancy keeps its other data
-- (the FK just nulls out).

ALTER TABLE "RecruitmentVacancy"
  ADD COLUMN "positionDescriptionId" TEXT;

CREATE INDEX "RecruitmentVacancy_positionDescriptionId_idx"
  ON "RecruitmentVacancy"("positionDescriptionId");

ALTER TABLE "RecruitmentVacancy"
  ADD CONSTRAINT "RecruitmentVacancy_positionDescriptionId_fkey"
  FOREIGN KEY ("positionDescriptionId") REFERENCES "PositionDescription"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
