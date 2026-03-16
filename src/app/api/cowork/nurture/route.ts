import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { resolveServiceByCode } from "../_lib/resolve-service";

/**
 * POST /api/cowork/nurture — Trigger nurture sequence via API key
 *
 * Body: { serviceCode, email, firstName?, lastName? }
 * Auth: API key with "email:write" scope
 */
export async function POST(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { serviceCode, email, firstName, lastName } = body as {
      serviceCode?: string;
      email?: string;
      firstName?: string;
      lastName?: string;
    };

    if (!serviceCode || !email) {
      return NextResponse.json(
        { error: "serviceCode and email are required" },
        { status: 400 },
      );
    }

    // Resolve service
    const service = await resolveServiceByCode(serviceCode);
    if (!service) {
      return NextResponse.json(
        { error: `Service not found: ${serviceCode}` },
        { status: 404 },
      );
    }

    // Upsert contact
    const contact = await prisma.centreContact.upsert({
      where: { email_serviceId: { email, serviceId: service.id } },
      update: { firstName: firstName || undefined, lastName: lastName || undefined },
      create: {
        email,
        firstName: firstName || null,
        lastName: lastName || null,
        serviceId: service.id,
      },
    });

    // Check if nurture steps already exist
    const existingSteps = await prisma.parentNurtureStep.findMany({
      where: { contactId: contact.id },
      select: { id: true },
    });

    if (existingSteps.length > 0) {
      return NextResponse.json({
        message: "Nurture sequence already exists for this contact",
        contactId: contact.id,
      });
    }

    // Create 6 staggered steps
    const now = new Date();
    const steps = [
      { stepNumber: 1, templateKey: "welcome", daysOffset: 0 },
      { stepNumber: 2, templateKey: "how_to_enrol", daysOffset: 2 },
      { stepNumber: 3, templateKey: "what_to_bring", daysOffset: 5 },
      { stepNumber: 4, templateKey: "app_setup", daysOffset: 7 },
      { stepNumber: 5, templateKey: "first_week", daysOffset: 14 },
      { stepNumber: 6, templateKey: "nps_survey", daysOffset: 30 },
    ];

    const created = await prisma.parentNurtureStep.createMany({
      data: steps.map((s) => ({
        serviceId: service.id,
        contactId: contact.id,
        stepNumber: s.stepNumber,
        templateKey: s.templateKey,
        scheduledFor: new Date(now.getTime() + s.daysOffset * 24 * 60 * 60 * 1000),
        status: "pending",
      })),
    });

    return NextResponse.json({
      success: true,
      contactId: contact.id,
      serviceCode,
      stepsCreated: created.count,
    });
  } catch (err) {
    console.error("[Cowork Nurture POST]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
