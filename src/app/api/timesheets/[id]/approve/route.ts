import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { approveTimesheet } from "@/lib/timesheet-approve";
// POST /api/timesheets/[id]/approve — approve a submitted timesheet
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const timesheet = await prisma.timesheet.findUnique({ where: { id } });
  if (!timesheet || timesheet.deleted) {
    return NextResponse.json({ error: "Timesheet not found" }, { status: 404 });
  }

  if (timesheet.status !== "submitted") {
    return NextResponse.json(
      { error: "Can only approve submitted timesheets" },
      { status: 400 }
    );
  }

  // Self-approval guard — an approver can't sign off a timesheet they submitted.
  if (timesheet.submittedById === session!.user.id) {
    throw ApiError.forbidden("You can't approve a timesheet you submitted");
  }

  const updated = await approveTimesheet(timesheet, session!.user.id);

  return NextResponse.json(updated);
}, { roles: ["owner", "head_office", "admin"] });
