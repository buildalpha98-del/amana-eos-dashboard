/**
 * GET /api/compliance/registers/staff[?serviceId=X]
 *
 * Returns the Reg 145 / Reg 148 staff register as JSON. Used by the
 * /compliance/registers page to render the on-screen table.
 *
 * For CSV download, hit /api/compliance/registers/staff/export.
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { buildStaffRegister } from "@/lib/nqf-registers";

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const serviceId = searchParams.get("serviceId") ?? undefined;
    const rows = await buildStaffRegister(serviceId);
    return NextResponse.json({ rows });
  },
  { roles: ["owner", "head_office", "admin"] },
);
