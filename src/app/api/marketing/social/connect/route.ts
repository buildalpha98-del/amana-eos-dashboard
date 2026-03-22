import crypto from "crypto";
import { NextResponse } from "next/server";
import { getMetaAuthUrl, isConfigured } from "@/lib/meta";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { z } from "zod";

const postSchema = z.object({
  platform: z.enum(["facebook", "instagram"]),
});

export const POST = withApiAuth(async (req, session) => {
if (!isConfigured()) {
    return NextResponse.json(
      { error: "Meta OAuth is not configured. Please set META_APP_ID, META_APP_SECRET, META_REDIRECT_URI, and META_ENCRYPTION_KEY." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { platform } = parsed.data;

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
    logger.error("Social connect error", { err });
    return NextResponse.json(
      { error: "Failed to initiate social connection" },
      { status: 500 }
    );
  }
}, { roles: ["owner", "head_office", "admin", "marketing"] });
