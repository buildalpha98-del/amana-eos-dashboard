/** GET /api/hq/centres/[serviceId]?termStart= — one centre's tab of the tracker. */
import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { hqCentre } from "@/lib/hq-summary";
import { HQ_ROLES, hqServiceIds } from "@/lib/hq-access";

export const GET = withApiAuth(
  async (req, session, context) => {
    const { serviceId } = await context!.params!;
    const scope = await hqServiceIds(session);
    if (scope && !scope.includes(serviceId)) throw ApiError.forbidden("Not your state's centre");
    const t = new URL(req.url).searchParams.get("termStart");
    const out = await hqCentre(serviceId, t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : undefined);
    if (!out.service) throw ApiError.notFound("Centre not found");
    return NextResponse.json(out);
  },
  { roles: HQ_ROLES },
);
