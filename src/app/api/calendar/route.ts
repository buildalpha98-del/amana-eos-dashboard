import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/server-auth";
import {
  getAuthUrl,
  isCalendarConfigured,
  isCalendarConnected,
} from "@/lib/microsoft-calendar";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

/**
 * GET /api/calendar
 * Returns the calendar integration status and auth URL if needed.
 */
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  if (!isCalendarConfigured()) {
    return NextResponse.json({
      configured: false,
      connected: false,
      message: "Calendar integration not configured. Add AZURE_AD_CLIENT_ID and AZURE_AD_CLIENT_SECRET.",
    });
  }

  const connected = await isCalendarConnected(session!.user.id);

  if (connected) {
    return NextResponse.json({ configured: true, connected: true });
  }

  // Generate a state token for CSRF protection
  const state = crypto.randomBytes(16).toString("hex");
  const authUrl = getAuthUrl(state);

  return NextResponse.json({
    configured: true,
    connected: false,
    authUrl,
    state,
  });
}

/**
 * DELETE /api/calendar
 * Disconnect the calendar integration.
 */
export async function DELETE() {
  const { session, error } = await requireAuth();
  if (error) return error;

  await prisma.calendarIntegration.deleteMany({
    where: { userId: session!.user.id },
  });

  return NextResponse.json({ success: true, message: "Calendar disconnected" });
}
