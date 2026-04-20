import { NextRequest, NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { hasFeature, parseRole } from "@/lib/role-permissions";
import { API_SCOPES } from "@/lib/api-key-auth";
import { logAuditEvent } from "@/lib/audit-log";
import { withApiAuth } from "@/lib/server-auth";

const createApiKeySchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  scopes: z
    .array(
      z.enum([...API_SCOPES], {
        error: `Scope must be one of: ${API_SCOPES.join(", ")}`,
      }),
    )
    .min(1, "At least one scope is required"),
  allowedIps: z.array(z.string().min(1)).default([]),
  expiresAt: z.string().datetime().optional(),
});

// GET /api/settings/api-keys — List all API keys
export const GET = withApiAuth(async (req, session) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "api_keys.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const keys = await prisma.apiKey.findMany({
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      allowedIps: true,
      expiresAt: true,
      revokedAt: true,
      lastUsedAt: true,
      createdAt: true,
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(keys);
});

// POST /api/settings/api-keys — Create a new API key
export const POST = withApiAuth(async (req, session) => {
  const role = parseRole(session!.user.role);
  if (!role || !hasFeature(role, "api_keys.manage")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createApiKeySchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 },
    );
  }

  // Generate a cryptographically secure random key
  const rawKey = randomBytes(32).toString("hex");
  const keyHash = createHash("sha256").update(rawKey).digest("hex");
  const keyPrefix = rawKey.slice(0, 8);

  const apiKey = await prisma.apiKey.create({
    data: {
      name: parsed.data.name,
      keyPrefix,
      keyHash,
      scopes: parsed.data.scopes,
      allowedIps: parsed.data.allowedIps,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : null,
      createdById: session!.user.id,
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      scopes: true,
      expiresAt: true,
      createdAt: true,
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "ApiKey",
      entityId: apiKey.id,
      details: { name: apiKey.name, scopes: apiKey.scopes },
    },
  });

  logAuditEvent({
    action: "apikey.created",
    actorId: session!.user.id,
    actorEmail: session!.user.email,
    targetId: apiKey.id,
    targetType: "ApiKey",
    metadata: { name: apiKey.name, scopes: apiKey.scopes, allowedIps: parsed.data.allowedIps },
  }, req);

  // Return the plaintext key ONCE — it can never be retrieved again
  return NextResponse.json(
    { ...apiKey, plaintext: rawKey },
    { status: 201 },
  );
});
