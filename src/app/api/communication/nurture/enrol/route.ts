import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

/**
 * POST /api/communication/nurture/enrol — Trigger a nurture sequence
 *
 * Creates a CentreContact if it doesn't exist, then creates 5 staggered
 * ParentNurtureStep records (Day 0, 2, 5, 7, 14).
 */
export async function POST(req: NextRequest) {
  const { error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const { email, firstName, lastName, serviceId } = body as {
    email?: string;
    firstName?: string;
    lastName?: string;
    serviceId?: string;
  };

  if (!email || !serviceId) {
    return NextResponse.json(
      { error: "email and serviceId are required" },
      { status: 400 },
    );
  }

  // Verify service exists
  const service = await prisma.service.findUnique({
    where: { id: serviceId },
    select: { id: true, name: true },
  });
  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  // Upsert contact
  const contact = await prisma.centreContact.upsert({
    where: { email_serviceId: { email, serviceId } },
    update: { firstName: firstName || undefined, lastName: lastName || undefined },
    create: { email, firstName: firstName || null, lastName: lastName || null, serviceId },
  });

  // Check if nurture steps already exist for this contact
  const existingSteps = await prisma.parentNurtureStep.findMany({
    where: { contactId: contact.id },
    select: { id: true },
  });

  if (existingSteps.length > 0) {
    return NextResponse.json(
      { message: "Nurture sequence already exists for this contact", contactId: contact.id },
      { status: 200 },
    );
  }

  // Create 5 staggered steps
  const now = new Date();
  const steps = [
    { stepNumber: 1, templateKey: "welcome", daysOffset: 0 },
    { stepNumber: 2, templateKey: "how_to_enrol", daysOffset: 2 },
    { stepNumber: 3, templateKey: "what_to_bring", daysOffset: 5 },
    { stepNumber: 4, templateKey: "app_setup", daysOffset: 7 },
    { stepNumber: 5, templateKey: "first_week", daysOffset: 14 },
  ];

  const created = await prisma.parentNurtureStep.createMany({
    data: steps.map((s) => ({
      serviceId,
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
    stepsCreated: created.count,
  });
}
