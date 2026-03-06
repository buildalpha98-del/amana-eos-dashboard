import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { hasFeature } from "@/lib/role-permissions";
import type { Role } from "@prisma/client";

// DELETE /api/settings/api-keys/[id] — Revoke an API key (soft delete)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { session, error } = await requireAuth();
  if (error) return error;

  // Feature check: only owners can manage API keys
  if (!hasFeature(session!.user.role as Role, "api_keys.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const existing = await prisma.apiKey.findUnique({
    where: { id },
    select: { id: true, name: true, revokedAt: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: "Not Found", message: "API key not found" },
      { status: 404 },
    );
  }

  if (existing.revokedAt) {
    return NextResponse.json(
      { error: "Bad Request", message: "API key is already revoked" },
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

  return NextResponse.json({ ok: true });
}
