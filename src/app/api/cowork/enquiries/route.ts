import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { logCoworkActivity } from "@/app/api/cowork/_lib/cowork-activity-log";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { scheduleNurtureFromStageChange } from "@/lib/nurture-scheduler";

import { parseJsonBody } from "@/lib/api-error";
import { resolveActivationFromUtm } from "@/lib/activation-attribution";
import { logEnquiryStageEvent } from "@/lib/enquiry-stage-events";
const createEnquirySchema = z
  .object({
    serviceId: z.string().min(1).optional(),
    /** Alternative to serviceId: the Service.code (e.g. "MFIS-GA"). */
    serviceCode: z.string().min(1).optional(),
    parentName: z.string().min(1),
    parentEmail: z.string().email().optional().nullable(),
    parentPhone: z.string().optional().nullable(),
    childName: z.string().optional().nullable(),
    childAge: z.number().int().optional().nullable(),
    channel: z.enum(["phone", "email", "whatsapp", "walkin", "referral", "website"]),
    parentDriver: z.string().optional().nullable(),
    assigneeId: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    /** Optional QR short code for activation attribution. */
    utmCampaign: z.string().max(64).optional().nullable(),
  })
  .refine((data) => Boolean(data.serviceId) !== Boolean(data.serviceCode), {
    message: "Provide exactly one of serviceId or serviceCode",
  });

/**
 * GET /api/cowork/enquiries — List active enquiries for pipeline scan
 * Auth: API key with "enquiries:read" scope
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");

  try {
    const now = new Date();
    const enquiries = await prisma.parentEnquiry.findMany({
      where: {
        deleted: false,
        stage: { notIn: ["cold"] },
        ...(serviceId ? { serviceId } : {}),
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
      orderBy: { stageChangedAt: "desc" },
    });

    const result = enquiries.map((e) => ({
      id: e.id,
      parentName: e.parentName,
      childName: e.childName,
      serviceName: e.service.name,
      serviceCode: e.service.code,
      serviceId: e.serviceId,
      stage: e.stage,
      daysInStage: Math.round(
        (now.getTime() - e.stageChangedAt.getTime()) / (1000 * 60 * 60 * 24),
      ),
      parentDriver: e.parentDriver,
      channel: e.channel,
      nextActionDue: e.nextActionDue,
      ccsEducated: e.ccsEducated,
      formStarted: e.formStarted,
      formCompleted: e.formCompleted,
      createdAt: e.createdAt,
    }));

    return NextResponse.json({ enquiries: result, count: result.length });
  } catch (err) {
    logger.error("Cowork Enquiries GET", { err });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});

/**
 * POST /api/cowork/enquiries — Create a new enquiry via API key
 * Auth: API key with "enquiries:write" scope
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const data = createEnquirySchema.parse(body);

    // Resolve serviceCode → serviceId (Service.code is @unique).
    let serviceId = data.serviceId;
    if (!serviceId && data.serviceCode) {
      const service = await prisma.service.findUnique({
        where: { code: data.serviceCode },
        select: { id: true },
      });
      if (!service) {
        return NextResponse.json(
          { success: false, error: `Unknown serviceCode: ${data.serviceCode}` },
          { status: 400 },
        );
      }
      serviceId = service.id;
    }

    const sourceActivationId = await resolveActivationFromUtm(data.utmCampaign ?? null);

    const enquiry = await prisma.parentEnquiry.create({
      data: {
        serviceId: serviceId!,
        parentName: data.parentName,
        parentEmail: data.parentEmail || null,
        parentPhone: data.parentPhone || null,
        childName: data.childName || null,
        childAge: data.childAge || null,
        channel: data.channel,
        parentDriver: data.parentDriver || null,
        assigneeId: data.assigneeId || null,
        notes: data.notes || null,
        sourceActivationId,
        stageChangedAt: new Date(),
      },
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
    });

    logCoworkActivity({
      action: "api_import",
      entityType: "ParentEnquiry",
      entityId: enquiry.id,
      details: { via: "cowork_api", keyName: "Cowork Automation" },
    });

    // Trigger welcome nurture email for new enquiries
    // Creation event for the pipeline history (fire-and-forget).
  logEnquiryStageEvent(enquiry.id, null, enquiry.stage);

  scheduleNurtureFromStageChange(enquiry.id, "new").catch((err) =>
      logger.error("Failed to schedule welcome nurture", { enquiryId: enquiry.id, err }),
    );

    return NextResponse.json({ success: true, enquiry }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Cowork Enquiries POST", { err });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
