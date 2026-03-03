import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { getXeroAuthUrl } from "@/lib/xero";

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  const state = crypto.randomBytes(16).toString("hex");
  const url = getXeroAuthUrl(state);

  return NextResponse.json({ url });
}
