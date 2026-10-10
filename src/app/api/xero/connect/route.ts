import crypto from "crypto";
import { NextResponse } from "next/server";
import { getXeroAuthUrl } from "@/lib/xero";
import { withApiAuth } from "@/lib/server-auth";

export const GET = withApiAuth(async (req, session) => {
  const state = crypto.randomBytes(32).toString("hex");
  const url = getXeroAuthUrl(state);

  const response = NextResponse.json({ url });
  response.cookies.set("xero_oauth_state", `${session.user.id}:${state}`, {
    httpOnly: true, secure: process.env.NODE_ENV === "production",
    sameSite: "lax", path: "/api/xero", maxAge: 10 * 60,
  });
  return response;
}, { roles: ["owner"] });
