import crypto from "crypto";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { getMetaAuthUrl, isConfigured } from "@/lib/meta";

export async function POST(req: Request) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  if (!isConfigured()) {
    return NextResponse.json(
      { error: "Meta OAuth is not configured. Please set META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, and META_ENCRYPTION_KEY." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const platform = body.platform as string;

    if (!platform || !["facebook", "instagram"].includes(platform)) {
      return NextResponse.json(
        { error: "Invalid platform. Must be 'facebook' or 'instagram'." },
        { status: 400 }
      );
    }

    const state = crypto.randomBytes(16).toString("hex");
    const authUrl = getMetaAuthUrl(state);

    // Return state so client can verify on callback, and the auth URL to redirect to
    const response = NextResponse.json({ authUrl, state });

    // Store state in a cookie for verification on callback
    response.cookies.set("meta_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600, // 10 minutes
      path: "/",
    });

    // Store the requested platform in a cookie so we know on callback
    response.cookies.set("meta_oauth_platform", platform, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    return response;
  } catch (err) {
    console.error("Social connect error:", err);
    return NextResponse.json(
      { error: "Failed to initiate social connection" },
      { status: 500 }
    );
  }
}
