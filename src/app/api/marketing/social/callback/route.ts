import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  exchangeCodeForTokens,
  getLongLivedToken,
  getPageAccessTokens,
  getInstagramAccounts,
  encryptToken,
  isConfigured,
} from "@/lib/meta";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

export const GET = withApiHandler(async (req) => {
    if (!isConfigured()) {
      return NextResponse.redirect(
        new URL("/marketing?tab=analytics&social=error&reason=not_configured", req.url)
      );
    }

    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");
    const errorParam = req.nextUrl.searchParams.get("error");

    if (errorParam) {
      logger.error("Meta OAuth error", { err: errorParam });
      return NextResponse.redirect(
        new URL("/marketing?tab=analytics&social=error&reason=denied", req.url)
      );
    }

    if (!code) {
      return NextResponse.redirect(
        new URL("/marketing?tab=analytics&social=error&reason=no_code", req.url)
      );
    }

    // Verify state
    const storedState = req.cookies.get("meta_oauth_state")?.value;
    if (!state || state !== storedState) {
      return NextResponse.redirect(
        new URL("/marketing?tab=analytics&social=error&reason=invalid_state", req.url)
      );
    }

    // Exchange code for short-lived token
    const shortTokenData = await exchangeCodeForTokens(code);

    // Exchange for long-lived user token
    const longTokenData = await getLongLivedToken(shortTokenData.access_token);
    const userToken = longTokenData.access_token;
    const tokenExpiresAt = new Date(
      Date.now() + (longTokenData.expires_in || 5184000) * 1000
    );

    // Fetch page access tokens
    const pages = await getPageAccessTokens(userToken);

    const scopes =
      "pages_show_list,pages_read_engagement,pages_read_user_content,instagram_basic,instagram_manage_insights";

    // For each page, upsert a Facebook SocialConnection
    for (const page of pages) {
      await prisma.socialConnection.upsert({
        where: {
          platform_accountId: {
            platform: "facebook",
            accountId: page.id,
          },
        },
        create: {
          platform: "facebook",
          status: "connected",
          accountId: page.id,
          accountName: page.name,
          accessToken: encryptToken(userToken),
          pageAccessToken: encryptToken(page.access_token),
          tokenExpiresAt,
          scopes,
        },
        update: {
          status: "connected",
          accountName: page.name,
          accessToken: encryptToken(userToken),
          pageAccessToken: encryptToken(page.access_token),
          tokenExpiresAt,
          scopes,
        },
      });

      // Check for Instagram business account linked to this page
      const igAccount = await getInstagramAccounts(page.id, page.access_token);
      if (igAccount) {
        await prisma.socialConnection.upsert({
          where: {
            platform_accountId: {
              platform: "instagram",
              accountId: igAccount.id,
            },
          },
          create: {
            platform: "instagram",
            status: "connected",
            accountId: igAccount.id,
            accountName: igAccount.username || igAccount.name,
            accessToken: encryptToken(userToken),
            pageAccessToken: encryptToken(page.access_token),
            tokenExpiresAt,
            scopes,
          },
          update: {
            status: "connected",
            accountName: igAccount.username || igAccount.name,
            accessToken: encryptToken(userToken),
            pageAccessToken: encryptToken(page.access_token),
            tokenExpiresAt,
            scopes,
          },
        });
      }
    }

    // Clear OAuth cookies
    const response = NextResponse.redirect(
      new URL("/marketing?tab=analytics&social=connected", req.url)
    );
    response.cookies.delete("meta_oauth_state");
    response.cookies.delete("meta_oauth_platform");

    return response;
  });
