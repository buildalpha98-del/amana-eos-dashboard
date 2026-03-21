import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";

// GET /api/notification-preferences — return current user's prefs
export async function GET() {
  const { session, error } = await requireAuth();
  if (error) return error;

  const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { notificationPrefs: true, role: true },
  });

  const defaults = getDefaultNotificationPrefs(user?.role ?? "staff");
  const stored = user?.notificationPrefs as Record<string, boolean> | null;
  const prefs = stored && Object.keys(stored).length > 0 ? stored : defaults;

  return NextResponse.json({ prefs });
}

// PUT /api/notification-preferences — update prefs
export async function PUT(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const { prefs } = body as { prefs?: Record<string, boolean> };

  if (!prefs || typeof prefs !== "object") {
    return NextResponse.json(
      { error: "Invalid preferences object" },
      { status: 400 },
    );
  }

  // Merge with defaults so we only allow known keys
  const roleDefaults = getDefaultNotificationPrefs(session!.user.role ?? "staff");
  const merged: Record<string, boolean> = { ...roleDefaults };
  for (const key of Object.keys(roleDefaults)) {
    if (key in prefs && typeof prefs[key] === "boolean") {
      merged[key] = prefs[key];
    }
  }

  await prisma.user.update({
    where: { id: session!.user.id },
    data: { notificationPrefs: merged },
  });

  return NextResponse.json({ prefs: merged });
}
