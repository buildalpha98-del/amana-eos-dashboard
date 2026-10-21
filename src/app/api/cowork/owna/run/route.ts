/**
 * POST /api/cowork/owna/run — one centre's OWNA data, read by Cowork from
 * the OWNA website (midweek and end of week). Children + regular booked
 * days, and every booked child's sign-in (or absence) per day per session.
 * Runs the normal OWNA sync over it (src/lib/cowork-owna-run.ts), so
 * attendance totals, first days, first-day emails and "we've missed you"
 * check-ins all follow. Bearer COWORK_API_KEY.
 */
import { NextResponse } from "next/server";
import { authenticateCowork, setVersionHeaders } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { coworkOwnaRunSchema, runCoworkOwnaData } from "@/lib/cowork-owna-run";

export const maxDuration = 120;

export const POST = withApiHandler(
  async (req) => {
    const authError = await authenticateCowork(req);
    if (authError) return authError;
    const parsed = coworkOwnaRunSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
    const result = await runCoworkOwnaData(parsed.data);
    if (!result) throw ApiError.notFound(`Service ${parsed.data.serviceCode} not found`);
    return setVersionHeaders(NextResponse.json(result, { status: result.errors.length ? 207 : 200 }));
  },
  { timeoutMs: 110_000 },
);
