/**
 * GET  /api/services/[id]/budget-bank — the centre's bank: balance, ledger,
 *      and this month so far (src/lib/budget-bank.ts). Admin tier, or the
 *      centre's own coordinator.
 * POST — spend from the bank {amount, description, category}: head office.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { ADMIN_ROLES, isAdminRole } from "@/lib/role-permissions";
import { bankOverview, spendFromBank } from "@/lib/budget-bank";
import { ensureCoordOwnService } from "@/app/api/services/[id]/budget/handlers";

export const GET = withApiAuth(
  async (_req, session, context) => {
    const { id } = await context!.params!;
    ensureCoordOwnService(session.user.role, (session.user as { serviceId?: string | null }).serviceId, id);
    return NextResponse.json({ ...(await bankOverview(id)), canSpend: isAdminRole(session.user.role) });
  },
  { roles: [...ADMIN_ROLES, "member"] },
);

const spendSchema = z
  .object({
    amount: z.number().positive().max(100_000),
    description: z.string().trim().min(2, "Say what it's for").max(200),
    category: z.enum(["kitchen", "sports", "art_craft", "furniture", "technology", "cleaning", "safety", "program_materials", "other"]),
  })
  .strict();

export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const parsed = spendSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const r = await spendFromBank({ serviceId: id, ...parsed.data, byId: session.user.id });
    return NextResponse.json({ ok: true, entryId: r.entry.id }, { status: 201 });
  },
  { roles: [...ADMIN_ROLES] },
);
