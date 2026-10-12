-- Staff emails can be raw HTML (pasted or uploaded), separate from parent marketing emails.
ALTER TABLE "StaffUpdate" ADD COLUMN "htmlContent" TEXT;
