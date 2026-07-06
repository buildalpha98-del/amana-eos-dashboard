-- 2026-07-06: enquiry stage-transition event log
CREATE TABLE "ParentEnquiryStageEvent" (
    "id" TEXT NOT NULL,
    "enquiryId" TEXT NOT NULL,
    "fromStage" TEXT,
    "toStage" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ParentEnquiryStageEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ParentEnquiryStageEvent_enquiryId_createdAt_idx" ON "ParentEnquiryStageEvent"("enquiryId", "createdAt");
CREATE INDEX "ParentEnquiryStageEvent_toStage_createdAt_idx" ON "ParentEnquiryStageEvent"("toStage", "createdAt");

ALTER TABLE "ParentEnquiryStageEvent" ADD CONSTRAINT "ParentEnquiryStageEvent_enquiryId_fkey" FOREIGN KEY ("enquiryId") REFERENCES "ParentEnquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
