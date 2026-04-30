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
import { logAuditEvent } from "@/lib/audit-log";
import { logger } from "@/lib/logger";

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
  "email:write",
  "whatsapp:write",
  "social:write",
  "audits:read",
  "audits:write",
  "holiday-quest:write",
  "holiday-quest:read",
  "reports:write",
  // ── Marketing (Cowork integration) ──
  "marketing:write",
  "marketing:read",
  "marketing-tasks:write",
  "marketing-tasks:read",
  "marketing-campaigns:write",
  "marketing-campaigns:read",
  // ── Enquiry Pipeline (Cowork integration) ──
  "enquiries:write",
  "enquiries:read",
  // ── Recruitment Pipeline (Cowork integration) ──
  "recruitment:write",
  "recruitment:read",
  // ── Attendance / Occupancy ──
  "attendance:read",
  // ── Enquiry Pipeline (aggregated stats) ──
  "pipeline:read",
  // ── HR / People (Cowork integration) ──
  "hr:read",
  // ── Billing / Overdue Fees (Cowork integration) ──
  "billing:read",
  "billing:write",
  // ── Finance (Cowork integration) ──
  "financials:read",
  // ── Operations / QIP / Incidents (Cowork integration) ──
  "operations:read",
  "operations:write",
  // ── Parent Experience (Cowork integration) ──
  "parent-experience:read",
  "parent-experience:write",
  // ── Partnerships (Cowork integration) ──
  "partnerships:read",
  "partnerships:write",
  // ── Staff Registry Sync (Cowork integration) ──
  "staff:sync",
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
      allowedIps: true,
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

  // IP allowlisting — empty array means allow all
  if (apiKey.allowedIps.length > 0) {
    const clientIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
    if (!apiKey.allowedIps.includes(clientIp)) {
      logAuditEvent({
        action: "apikey.ip_denied",
        targetId: apiKey.id,
        targetType: "ApiKey",
        metadata: { keyName: apiKey.name, clientIp, allowedIps: apiKey.allowedIps },
      }, request);
      return {
        apiKey: null,
        error: NextResponse.json(
          { error: "Forbidden", message: "Request IP is not in the allowlist for this API key" },
          { status: 403 },
        ),
      };
    }
  }

  // Fire-and-forget: update lastUsedAt (non-blocking)
  prisma.apiKey
    .update({ where: { id: apiKey.id }, data: { lastUsedAt: now } })
    .catch((err) => logger.error("Failed to update apiKey.lastUsedAt", { err, apiKeyId: apiKey.id }));

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
