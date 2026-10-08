/**
 * GET /api/services/[id]/checklists/today — each checklist section today:
 * done / total, its due time (Settings → Checklists) and whether it's
 * overdue. Feeds the "Checklists today" card (OWNA's "2 of 8 signed off").
 */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { assertServiceAccess } from "@/lib/authz-scope";
import { getChecklistStatusToday } from "@/lib/checklist-due-server";

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session, id);
  return NextResponse.json(await getChecklistStatusToday(id));
});
