-- Add post-call analysis fields and enquiry linkage to VapiCall
ALTER TABLE "VapiCall" ADD COLUMN "summary" TEXT;
ALTER TABLE "VapiCall" ADD COLUMN "successEvaluation" BOOLEAN;
ALTER TABLE "VapiCall" ADD COLUMN "linkedEnquiryId" TEXT;

-- Unique constraint on linkedEnquiryId (one call per enquiry)
CREATE UNIQUE INDEX "VapiCall_linkedEnquiryId_key" ON "VapiCall"("linkedEnquiryId");

-- FK to ParentEnquiry with SET NULL on delete
ALTER TABLE "VapiCall" ADD CONSTRAINT "VapiCall_linkedEnquiryId_fkey"
  FOREIGN KEY ("linkedEnquiryId") REFERENCES "ParentEnquiry"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
