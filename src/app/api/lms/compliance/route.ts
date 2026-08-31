import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { getTrainingComplianceReport } from "@/lib/training-compliance";

/**
 * GET /api/lms/compliance
 *
 * Org-wide "who's behind on required training" report for the admin Compliance
 * view. Returns staff (grouped) with outstanding essential/monthly-track
 * courses, overdue flagged. Admin roles only.
 */
export const GET = withApiAuth(
  async () => {
    const report = await getTrainingComplianceReport();
    return NextResponse.json(report);
  },
  { roles: ["owner", "head_office", "admin"] },
);
