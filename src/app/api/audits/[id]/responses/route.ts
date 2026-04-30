import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { z } from "zod";

import { ApiError, parseJsonBody } from "@/lib/api-error";
const patchSchema = z.object({
  responses: z.array(z.object({
    id: z.string().min(1),
    result: z.string().optional(),
    ratingValue: z.number().nullable().optional(),
    actionRequired: z.string().nullable().optional(),
    evidenceSighted: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
    photoUrl: z.string().nullable().optional(),
  })).min(1, "responses array is required"),
});

/**
 * PATCH /api/audits/[id]/responses — bulk save progress on audit responses
 */
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  const body = await parseJsonBody(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }
  const { responses } = parsed.data;

  // Verify audit instance exists and belongs to caller
  const instance = await prisma.auditInstance.findUnique({
    where: { id },
    select: { id: true, status: true, serviceId: true },
  });

  if (!instance) {
    return NextResponse.json({ error: "Audit not found" }, { status: 404 });
  }

  // Coordinators must be on the audit's own service.
  const role = session!.user.role ?? "";
  if (role === "member") {
    const userServiceId =
      (session!.user as { serviceId?: string | null }).serviceId ?? null;
    if (!userServiceId || userServiceId !== instance.serviceId) {
      throw ApiError.forbidden(
        "Coordinators can only work on audits for their own service.",
      );
    }
  }

  // Bulk upsert responses
  const results = await prisma.$transaction(
    responses.map((r) => {
      const data: Record<string, unknown> = {};
      if (r.result !== undefined) data.result = r.result;
      if (r.ratingValue !== undefined) data.ratingValue = r.ratingValue;
      if (r.actionRequired !== undefined) data.actionRequired = r.actionRequired;
      if (r.evidenceSighted !== undefined) data.evidenceSighted = r.evidenceSighted;
      if (r.notes !== undefined) data.notes = r.notes;
      if (r.photoUrl !== undefined) data.photoUrl = r.photoUrl;

      return prisma.auditItemResponse.update({
        where: { id: r.id },
        data,
      });
    })
  );

  return NextResponse.json({ updated: results.length });
}, {
  // Same gate as PATCH /api/audits/[id]: coord+ on their own service,
  // admin tier and member elsewhere.
  roles: ["owner", "head_office", "admin", "member"],
});
