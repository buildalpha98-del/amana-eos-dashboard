import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
import { approveTimesheet } from "@/lib/timesheet-approve";
import { logger } from "@/lib/logger";

const bulkApproveSchema = z.object({
  ids: z.array(z.string().min(1)).min(1, "At least one timesheet id is required").max(50, "At most 50 timesheets per bulk approval"),
});

// POST /api/timesheets/bulk-approve — approve up to 50 submitted timesheets.
// Approves only sheets in `submitted` status that the caller did NOT submit;
// everything else is reported back as a per-sheet skip, never an error.
export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = bulkApproveSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const ids = Array.from(new Set(parsed.data.ids));

  const timesheets = await prisma.timesheet.findMany({
    where: { id: { in: ids } },
  });
  const byId = new Map(timesheets.map((t) => [t.id, t]));

  const approved: string[] = [];
  const skipped: { id: string; reason: string }[] = [];

  // Sequential on purpose — approveTimesheet writes activity + notification
  // per sheet, and the cap is 50, so this stays well within request budget.
  for (const id of ids) {
    const timesheet = byId.get(id);

    if (!timesheet || timesheet.deleted) {
      skipped.push({ id, reason: "Timesheet not found" });
      continue;
    }
    if (timesheet.status !== "submitted") {
      skipped.push({ id, reason: "Not in submitted status" });
      continue;
    }
    // Same self-approval guard as the single approve route, as a per-sheet skip.
    if (timesheet.submittedById === session!.user.id) {
      skipped.push({ id, reason: "You submitted this timesheet" });
      continue;
    }

    try {
      await approveTimesheet(timesheet, session!.user.id);
      approved.push(id);
    } catch (err) {
      logger.error("Bulk approve: failed to approve timesheet", {
        err,
        timesheetId: id,
      });
      skipped.push({ id, reason: "Approval failed" });
    }
  }

  return NextResponse.json({ approved, skipped });
}, { roles: ["owner", "head_office", "admin"] });
