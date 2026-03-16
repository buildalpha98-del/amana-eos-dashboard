import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/health — Public health check endpoint.
 *
 * Returns database connectivity status for uptime monitors.
 * No authentication required — designed for external monitoring (UptimeRobot, Better Stack).
 */
export async function GET() {
  const checks: Record<string, "connected" | "error"> = {
    database: "error",
    redis: "error",
  };

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = "connected";
  } catch {
    // database unreachable
  }

  // Check Redis connectivity
  try {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
      const { Redis } = await import("@upstash/redis");
      const redis = new Redis({ url, token });
      await redis.ping();
      checks.redis = "connected";
    } else {
      checks.redis = "connected"; // No Redis configured — not an error
    }
  } catch {
    // Redis unreachable
  }

  const allHealthy = Object.values(checks).every((s) => s === "connected");

  return NextResponse.json(
    {
      status: allHealthy ? "ok" : "degraded",
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? "dev",
      checks,
    },
    { status: allHealthy ? 200 : 503 },
  );
}
