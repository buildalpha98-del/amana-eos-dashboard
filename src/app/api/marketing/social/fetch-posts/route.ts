import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { decryptToken, fetchRecentPosts } from "@/lib/meta";

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin", "marketing"]);
  if (error) return error;

  try {
    const connectionId = req.nextUrl.searchParams.get("connectionId");

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId query parameter is required" },
        { status: 400 }
      );
    }

    const connection = await prisma.socialConnection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 }
      );
    }

    if (connection.status !== "connected") {
      return NextResponse.json(
        { error: "Connection is not active" },
        { status: 400 }
      );
    }

    if (!connection.pageAccessToken) {
      return NextResponse.json(
        { error: "No page access token available" },
        { status: 400 }
      );
    }

    const token = decryptToken(connection.pageAccessToken);
    const platform = connection.platform as "facebook" | "instagram";
    const accountId = connection.accountId;

    if (!accountId) {
      return NextResponse.json(
        { error: "No account ID available" },
        { status: 400 }
      );
    }

    // Fetch posts from the last 30 days
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const posts = await fetchRecentPosts(token, accountId, platform, since);

    return NextResponse.json(posts);
  } catch (err) {
    console.error("Fetch social posts error:", err);
    return NextResponse.json(
      { error: "Failed to fetch social posts" },
      { status: 500 }
    );
  }
}
