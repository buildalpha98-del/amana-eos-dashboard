/**
 * POST /api/settings/ai-knowledge/seed
 *
 * Handbook re-index trigger. Re-syncs the Employee Handbook into the
 * KnowledgeSource store via the handbook adapter (idempotent — a
 * matching contentHash is a no-op).
 *
 * Owner / head_office / admin can run it.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { syncHandbook } from "@/lib/knowledge/adapters/handbook";
import { ADMIN_ROLES } from "@/lib/role-permissions";

export const POST = withApiAuth(
  async () => {
    const results = await syncHandbook();
    return NextResponse.json({ results });
  },
  { roles: [...ADMIN_ROLES] },
);
