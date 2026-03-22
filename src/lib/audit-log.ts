/**
 * Security audit logging for sensitive actions.
 *
 * Fire-and-forget by default — never blocks the request.
 * Use `logAuditEvent()` from API routes to record who did what.
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { logger } from "@/lib/logger";

export interface AuditEvent {
  action: string;
  actorId?: string | null;
  actorEmail?: string | null;
  targetId?: string | null;
  targetType?: string | null;
  metadata?: Record<string, unknown> | null;
}

function extractRequestInfo(req?: NextRequest) {
  if (!req) return { ip: null, userAgent: null };
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  return { ip, userAgent };
}

/**
 * Log an audit event (fire-and-forget — does not throw or block).
 */
export function logAuditEvent(event: AuditEvent, req?: NextRequest): void {
  const { ip, userAgent } = extractRequestInfo(req);

  prisma.securityAuditLog
    .create({
      data: {
        action: event.action,
        actorId: event.actorId ?? null,
        actorEmail: event.actorEmail ?? null,
        targetId: event.targetId ?? null,
        targetType: event.targetType ?? null,
        metadata: (event.metadata as Prisma.InputJsonValue) ?? undefined,
        ip,
        userAgent,
      },
    })
    .catch((err) => {
      logger.error("Failed to write audit event", { err });
    });
}
