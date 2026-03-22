import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDefaultNotificationPrefs } from "@/lib/notification-defaults";
import { parseJsonField, notificationPrefsSchema } from "@/lib/schemas/json-fields";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

const updatePrefsSchema = z.object({
  prefs: z.record(z.string(), z.boolean()),
});

// GET /api/notification-preferences — return current user's prefs
export const GET = withApiAuth(async (req, session) => {
const user = await prisma.user.findUnique({
    where: { id: session!.user.id },
    select: { notificationPrefs: true, role: true },
  });

  const defaults = getDefaultNotificationPrefs(user?.role ?? "staff");
  const stored = parseJsonField(user?.notificationPrefs, notificationPrefsSchema, {});
  const prefs = Object.keys(stored).length > 0 ? stored : defaults;

  return NextResponse.json({ prefs });
});

// PUT /api/notification-preferences — update prefs
export const PUT = withApiAuth(async (req, session) => {
const body = await req.json();
  const parsed = updatePrefsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed", details: parsed.error.flatten().fieldErrors }, { status: 400 });
  }
  const { prefs } = parsed.data;

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
});
