import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/calendar/callback
 * Microsoft redirects here after the user authorises calendar access.
 * We exchange the auth code for tokens and store them.
 */
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  const { searchParams } = new URL(req.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";

  if (error) {
    console.error("[CALENDAR] Auth error:", error, errorDescription);
    return NextResponse.redirect(
      `${baseUrl}/settings?calendar=error&message=${encodeURIComponent(errorDescription || error)}`
    );
  }

  if (!code) {
    return NextResponse.redirect(
      `${baseUrl}/settings?calendar=error&message=No+auth+code+received`
    );
  }

  try {
    // Exchange code for tokens using the token endpoint directly
    // (MSAL's acquireTokenByCode requires maintaining a cache across requests
    //  which is complex in serverless — direct fetch is more reliable)
    const tenantId = process.env.AZURE_AD_TENANT_ID || "common";
    const tokenUrl = `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`;

    const body = new URLSearchParams({
      client_id: process.env.AZURE_AD_CLIENT_ID!,
      client_secret: process.env.AZURE_AD_CLIENT_SECRET!,
      code,
      redirect_uri: `${baseUrl}/api/calendar/callback`,
      grant_type: "authorization_code",
      scope: "Calendars.ReadWrite User.Read offline_access",
    });

    const tokenRes = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error("[CALENDAR] Token exchange failed:", errText);
      return NextResponse.redirect(
        `${baseUrl}/settings?calendar=error&message=Token+exchange+failed`
      );
    }

    const tokenData = await tokenRes.json();

    // Store tokens in CalendarIntegration
    await prisma.calendarIntegration.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        provider: "microsoft",
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scope: tokenData.scope,
      },
      update: {
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        expiresAt: new Date(Date.now() + tokenData.expires_in * 1000),
        scope: tokenData.scope,
      },
    });

    return NextResponse.redirect(`${baseUrl}/settings?calendar=connected`);
  } catch (err) {
    console.error("[CALENDAR] Callback error:", err);
    return NextResponse.redirect(
      `${baseUrl}/settings?calendar=error&message=Unexpected+error`
    );
  }
}
