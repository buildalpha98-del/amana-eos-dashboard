import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeCodeForTokens,
  fetchXeroConnections,
  encryptToken,
} from "@/lib/xero";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");

    if (!code) {
      return NextResponse.redirect(new URL("/settings?xero=error", req.url));
    }

    const tokens = await exchangeCodeForTokens(code);
    const connections = await fetchXeroConnections(tokens.access_token);
    const tenant = connections[0];

    const tokenExpiresAt = new Date(Date.now() + tokens.expires_in * 1000);

    await prisma.xeroConnection.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        status: "connected",
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: encryptToken(tokens.refresh_token),
        tokenExpiresAt,
        scopes: tokens.scope,
      },
      update: {
        status: "connected",
        tenantId: tenant.tenantId,
        tenantName: tenant.tenantName,
        accessToken: encryptToken(tokens.access_token),
        refreshToken: encryptToken(tokens.refresh_token),
        tokenExpiresAt,
        scopes: tokens.scope,
      },
    });

    return NextResponse.redirect(new URL("/settings?xero=connected", req.url));
  } catch (err) {
    console.error("Xero callback error:", err);
    return NextResponse.redirect(new URL("/settings?xero=error", req.url));
  }
}
