/**
 * Database-backed API key authentication middleware.
 *
 * Replaces the simple env-var check for new endpoints while keeping
 * backward compatibility with the existing Cowork endpoints.
 *
 * Keys are stored as SHA-256 hashes — plaintext is only shown once at creation.
 */

import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ── Types ─────────────────────────────────────────────────────

export interface ApiKeyRecord {
  id: string;
  name: string;
  scopes: string[];
  createdById: string;
}

/** All valid scope values */
export const API_SCOPES = [
  "programs:write",
  "programs:read",
  "menus:write",
  "menus:read",
  "announcements:write",
  "announcements:read",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

// ── Helpers ───────────────────────────────────────────────────

export function hashApiKey(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Main auth function ────────────────────────────────────────

/**
 * Authenticate a request using a database-backed API key.
 *
 * @param request   - Incoming Next.js request
 * @param requiredScope - The scope the endpoint requires (e.g. "programs:write")
 * @returns `{ apiKey, error }` — if `error` is non-null, return it immediately
 */
export async function authenticateApiKey(
  request: NextRequest,
  requiredScope: ApiScope,
): Promise<{ apiKey: ApiKeyRecord | null; error: NextResponse | null }> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return {
      apiKey: null,
      error: NextResponse.json(
        { error: "Unauthorized", message: "Missing or malformed Authorization header" },
        { status: 401 },
      ),
    };
  }

  const keyHash = hashApiKey(token);
  const now = new Date();

  const apiKey = await prisma.apiKey.findUnique({
    where: { keyHash },
    select: {
      id: true,
      name: true,
      scopes: true,
      createdById: true,
      revokedAt: true,
      expiresAt: true,
    },
  });

  if (!apiKey) {
    return {
      apiKey: null,
      error: NextResponse.json(
        { error: "Unauthorized", message: "Invalid API key" },
        { status: 401 },
      ),
    };
  }

  if (apiKey.revokedAt) {
    return {
      apiKey: null,
      error: NextResponse.json(
        { error: "Unauthorized", message: "API key has been revoked" },
        { status: 401 },
      ),
    };
  }

  if (apiKey.expiresAt && apiKey.expiresAt < now) {
    return {
      apiKey: null,
      error: NextResponse.json(
        { error: "Unauthorized", message: "API key has expired" },
        { status: 401 },
      ),
    };
  }

  if (!apiKey.scopes.includes(requiredScope)) {
    return {
      apiKey: null,
      error: NextResponse.json(
        { error: "Forbidden", message: `API key lacks required scope: ${requiredScope}` },
        { status: 403 },
      ),
    };
  }

  // Fire-and-forget: update lastUsedAt (non-blocking)
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: now } })
    .catch(() => {});

  return {
    apiKey: {
      id: apiKey.id,
      name: apiKey.name,
      scopes: apiKey.scopes,
      createdById: apiKey.createdById,
    },
    error: null,
  };
}
