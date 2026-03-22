import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { scheduleNurtureFromStageChange } from "@/lib/nurture-scheduler";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
import { parseJsonBody } from "@/lib/api-error";

const childSchema = z.object({
  name: z.string(),
  age: z.number().int().nullable().optional(),
});

const updateEnquirySchema = z.object({
  parentName: z.string().optional(),
  parentEmail: z.string().email().optional().nullable(),
  parentPhone: z.string().optional().nullable(),
  childName: z.string().optional().nullable(),
  childAge: z.number().int().optional().nullable(),
  childrenDetails: z.array(childSchema).optional().nullable(),
  channel: z.string().optional(),
  parentDriver: z.string().optional().nullable(),
  stage: z.string().optional(),
  nextActionDue: z.coerce.date().optional().nullable(),
  ccsEducated: z.boolean().optional(),
  formStarted: z.boolean().optional(),
  formCompleted: z.boolean().optional(),
  firstSessionDate: z.coerce.date().optional().nullable(),
  referralId: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// GET /api/enquiries/[id] — single enquiry with all relations
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    const enquiry = await prisma.parentEnquiry.findUnique({
      where: { id },
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
        touchpoints: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!enquiry) {
      return NextResponse.json({ error: "Enquiry not found" }, { status: 404 });
    }

    return NextResponse.json(enquiry);
  } catch (err) {
    logger.error("Enquiry GET", { err });
    return NextResponse.json(
      { error: "Failed to fetch enquiry" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });

// PATCH /api/enquiries/[id] — update enquiry
export const PATCH = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    const body = await parseJsonBody(req);
    const data = updateEnquirySchema.parse(body);

    // If stage is changing, auto-update stageChangedAt and log daysInStage
    const updateData: Record<string, unknown> = { ...data };
    if (data.stage) {
      const existing = await prisma.parentEnquiry.findUnique({
        where: { id },
        select: { stage: true, stageChangedAt: true },
      });

      if (existing && existing.stage !== data.stage) {
        const daysInStage = Math.round(
          (Date.now() - existing.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (process.env.NODE_ENV !== "production") console.log(
          `[Enquiry] ${id}: stage ${existing.stage} → ${data.stage} (${daysInStage} days in previous stage)`,
        );
        updateData.stageChangedAt = new Date();

        // Schedule nurture steps for the new stage (fire-and-forget)
        scheduleNurtureFromStageChange(id, data.stage).catch((err) =>
          logger.error("Enquiry: Nurture scheduling failed", { err }),
        );
      }
    }

    const enquiry = await prisma.parentEnquiry.update({
      where: { id },
      data: updateData,
      include: {
        service: { select: { id: true, name: true, code: true } },
        assignee: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json(enquiry);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Enquiry PATCH", { err });
    return NextResponse.json(
      { error: "Failed to update enquiry" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });

// DELETE /api/enquiries/[id] — soft delete
export const DELETE = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    await prisma.parentEnquiry.update({
      where: { id },
      data: { deleted: true },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("Enquiry DELETE", { err });
    return NextResponse.json(
      { error: "Failed to delete enquiry" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });
