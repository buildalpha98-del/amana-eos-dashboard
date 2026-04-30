import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { ActivationType } from "@prisma/client";
import { getTermForDate } from "@/lib/school-terms";

const patchSchema = z.object({
  activationType: z.nativeEnum(ActivationType).nullable().optional(),
  scheduledFor: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid scheduledFor" }).nullable().optional(),
  expectedAttendance: z.number().int().min(0).nullable().optional(),
  actualAttendance: z.number().int().min(0).nullable().optional(),
  enquiriesGenerated: z.number().int().min(0).nullable().optional(),
  budget: z.number().nonnegative().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  coordinatorId: z.string().nullable().optional(),
});

export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("activation id required");

    const raw = await parseJsonBody(req);
    const parsed = patchSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const existing = await prisma.campaignActivationAssignment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Activation not found");

    const data: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed.data)) {
      if (v === undefined) continue;
      if (k === "scheduledFor") {
        data[k] = v ? new Date(v as string) : null;
      } else {
        data[k] = v;
      }
    }
    if ("scheduledFor" in data) {
      const sched = data.scheduledFor as Date | null;
      const term = sched ? getTermForDate(sched) : null;
      data.termYear = term?.year ?? null;
      data.termNumber = term?.number ?? null;
    }

    const updated = await prisma.campaignActivationAssignment.update({
      where: { id },
      data,
      select: { id: true, lifecycleStage: true, scheduledFor: true, termYear: true, termNumber: true },
    });
    return NextResponse.json({
      id: updated.id,
      lifecycleStage: updated.lifecycleStage,
      scheduledFor: updated.scheduledFor?.toISOString() ?? null,
      termYear: updated.termYear,
      termNumber: updated.termNumber,
    });
  },
  { roles: ["marketing", "owner"] },
);
