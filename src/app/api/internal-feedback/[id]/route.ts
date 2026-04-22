import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logAuditEvent } from "@/lib/audit-log";

const STATUSES = ["new", "acknowledged", "in_progress", "resolved"] as const;

const patchFeedbackSchema = z
  .object({
    status: z.enum(STATUSES).optional(),
    adminNotes: z.string().max(5000).optional(),
  })
  .refine((v) => v.status !== undefined || v.adminNotes !== undefined, {
    message: "At least one of status or adminNotes must be provided",
  });

export const GET = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const feedback = await prisma.internalFeedback.findUnique({
      where: { id },
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!feedback) throw ApiError.notFound("Feedback not found");
    return NextResponse.json({ feedback });
  },
  { roles: ["owner", "head_office", "admin"] },
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    const body = await parseJsonBody(req);
    const parsed = patchFeedbackSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message, details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }

    const existing = await prisma.internalFeedback.findUnique({
      where: { id },
      select: { id: true, status: true, adminNotes: true },
    });
    if (!existing) throw ApiError.notFound("Feedback not found");

    const { status, adminNotes } = parsed.data;
    const data: Record<string, unknown> = {};
    if (status !== undefined) {
      data.status = status;
      data.resolvedAt = status === "resolved" ? new Date() : null;
    }
    if (adminNotes !== undefined) {
      data.adminNotes = adminNotes;
    }

    const updated = await prisma.internalFeedback.update({
      where: { id },
      data,
      include: {
        author: { select: { id: true, name: true, email: true, role: true } },
      },
    });

    if (status !== undefined && status !== existing.status) {
      logAuditEvent(
        {
          action: "feedback.status_changed",
          actorId: session.user.id,
          actorEmail: session.user.email ?? null,
          targetId: id,
          targetType: "InternalFeedback",
          metadata: { from: existing.status, to: status },
        },
        req,
      );
    }

    return NextResponse.json({ feedback: updated });
  },
  { roles: ["owner", "head_office", "admin"] },
);
