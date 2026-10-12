/** POST { audienceRoles, audienceServiceIds } — how many people that reaches. */
import { NextResponse } from "next/server";
import { z } from "zod";
import { Role } from "@prisma/client";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { ADMIN_ROLES } from "@/lib/role-permissions";
import { countAudience } from "@/lib/staff-updates";

const schema = z.object({
  audienceRoles: z.array(z.nativeEnum(Role)).default([]),
  audienceServiceIds: z.array(z.string()).default([]),
});

export const POST = withApiAuth(
  async (req) => {
    const parsed = schema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Invalid audience.");
    return NextResponse.json({ count: await countAudience(parsed.data) });
  },
  { roles: [...ADMIN_ROLES] },
);
