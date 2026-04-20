import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasFeature, parseRole } from "@/lib/role-permissions";
import { withApiAuth } from "@/lib/server-auth";

// DELETE /api/settings/api-keys/[id] — Revoke an API key (soft delete)
export const DELETE = withApiAuth(async (req, session, context) => {
  // Feature check: only owners can manage API keys
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "api_keys.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context!.params!;

  const existing = await prisma.apiKey.findUnique({
    where: { id },
    select: { id: true, name: true, revokedAt: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "API key not found" },
      { status: 404 },
    );
  }

  if (existing.revokedAt) {
    return NextResponse.json(
      { error: "API key is already revoked" },
      { status: 400 },
    );
  }

  await prisma.apiKey.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "revoke",
      entityType: "ApiKey",
      entityId: id,
      details: { name: existing.name },
    },
  });

  return NextResponse.json({ success: true });
});
