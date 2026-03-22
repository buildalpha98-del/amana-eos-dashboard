import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getXeroAuthUrl } from "@/lib/xero";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
const state = crypto.randomBytes(16).toString("hex");
  const url = getXeroAuthUrl(state);

  return NextResponse.json({ url });
}, { roles: ["owner"] });
