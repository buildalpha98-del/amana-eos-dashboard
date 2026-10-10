import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeCodeForTokens,
  fetchXeroConnections,
  encryptToken,
} from "@/lib/xero";
import crypto from "crypto";
import { withApiAuth } from "@/lib/server-auth";
import { handleApiError } from "@/lib/api-handler";

export const GET = withApiAuth(async (req, session) => {
  const code = req.nextUrl.searchParams.get("code");
  const state = req.nextUrl.searchParams.get("state");

  const stored = req.cookies.get("xero_oauth_state")?.value;
  const expected = `${session.user.id}:${state ?? ""}`;
  const finish = (response: NextResponse) => {
    response.cookies.set("xero_oauth_state", "", { path: "/api/xero", maxAge: 0 });
    return response;
  };
  if (!state || !stored || Buffer.byteLength(stored) !== Buffer.byteLength(expected) ||
      !crypto.timingSafeEqual(Buffer.from(stored), Buffer.from(expected))) {
    return finish(NextResponse.json({ error: "Invalid or expired OAuth state" }, { status: 400 }));
  }
  if (!code) {
    return finish(NextResponse.redirect(new URL("/settings?xero=error", req.url)));
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const connections = await fetchXeroConnections(tokens.access_token);
    const tenant = connections[0];
    if (!tenant?.tenantId) {
      return finish(NextResponse.json({ error: "No Xero organisation was authorised" }, { status: 400 }));
    }

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

    return finish(NextResponse.redirect(new URL("/settings?xero=connected", req.url)));
  } catch (err) {
    return finish(handleApiError(req, err));
  }
}, { roles: ["owner"] });
