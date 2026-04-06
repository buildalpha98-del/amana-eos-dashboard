/**
 * PATCH /api/calls/[id] — Update a VAPI call record (status, assignee, notes, urgency).
 */

import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { z } from "zod";

const updateSchema = z.object({
  status: z.enum(["new", "in_progress", "actioned", "closed"]).optional(),
  assignedTo: z.string().optional(),
  notes: z.string().optional(),
  urgency: z.enum(["routine", "urgent", "critical"]).optional(),
});

export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  if (!id) throw ApiError.badRequest("Missing call ID");

  const body = await parseJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest("Invalid body", parsed.error.flatten());

  const data: Record<string, unknown> = { ...parsed.data };

  // Auto-set actioned metadata when status changes to actioned or closed
  if (parsed.data.status === "actioned" || parsed.data.status === "closed") {
    data.actionedAt = new Date();
    data.actionedBy = session.user?.name ?? "Unknown";
  }

  const existing = await prisma.vapiCall.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("Call not found");

  const updated = await prisma.vapiCall.update({
    where: { id },
    data,
  });

  return NextResponse.json(updated);
});
