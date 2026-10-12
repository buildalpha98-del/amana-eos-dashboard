/**
 * The centre's Program Plan from SharePoint (src/lib/program-plan/sync.ts).
 *
 * GET  — the last sync per plan file, newest first: when, which file, and
 *        each week's theme (shown above the week on Program). Anyone who can
 *        see the centre.
 * POST — "Sync now": the centre account or office pulls the newest plan
 *        straight away, e.g. just after uploading it. `{ force: true }`
 *        re-reads a plan whose file hasn't changed.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { assertServiceAccess } from "@/lib/authz-scope";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { isProgramPlanSyncConfigured, runProgramPlanSync } from "@/lib/program-plan/sync";

export const maxDuration = 300;

export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  assertServiceAccess(session, id);
  const syncs = await prisma.programPlanSync.findMany({
    where: { serviceId: id },
    orderBy: { syncedAt: "desc" },
    take: 4,
    select: { fileName: true, webUrl: true, status: true, error: true, weeks: true, syncedAt: true },
  });
  return NextResponse.json({ configured: isProgramPlanSyncConfigured(), syncs });
});

const bodySchema = z.object({ force: z.boolean().optional() }).optional();

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    assertServiceAccess(session, id);
    if (!isProgramPlanSyncConfigured()) {
      throw new ApiError(503, "SharePoint isn't connected yet, so the program can't be pulled in.");
    }
    const body = bodySchema.parse(await parseJsonBody(req).catch(() => undefined));
    const [result] = await runProgramPlanSync({ serviceId: id, force: body?.force });
    if (!result) throw ApiError.notFound("Centre not found.");
    if (result.status === "error") throw new ApiError(502, result.message ?? "Couldn't read the program plan.");
    return NextResponse.json(result);
  },
  {
    roles: [...ADMIN_ROLES, "member"],
    rateLimit: { max: 3, windowMs: 60_000 },
    timeoutMs: 290_000,
  },
);
