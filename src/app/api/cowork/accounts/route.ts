/**
 * POST /api/cowork/accounts — Amana HQ's master accounts tracker
 * (src/lib/hq-accounts-ingest.ts): weekly log, Woolies orders, resources,
 * stock lists, program feedback. Any subset; upserts on stable keys.
 * Bearer COWORK_API_KEY.
 */
import { NextResponse } from "next/server";
import { authenticateCowork, setVersionHeaders } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { accountsSchema, ingestAccounts } from "@/lib/hq-accounts-ingest";

export const maxDuration = 120;

export const POST = withApiHandler(
  async (req) => {
    const authError = await authenticateCowork(req);
    if (authError) return authError;
    const parsed = accountsSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
    return setVersionHeaders(NextResponse.json(await ingestAccounts(parsed.data)));
  },
  { timeoutMs: 110_000 },
);
