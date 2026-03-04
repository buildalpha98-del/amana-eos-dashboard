import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";

const createCertSchema = z.object({
  serviceId: z.string().min(1),
  userId: z.string().optional().nullable(),
  type: z.enum(["wwcc", "first_aid", "anaphylaxis", "asthma", "cpr", "police_check", "annual_review", "other"]),
  label: z.string().optional().nullable(),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  notes: z.string().optional().nullable(),
  alertDays: z.number().optional(),
});

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const upcoming = searchParams.get("upcoming"); // "30" = next 30 days

  const scope = getServiceScope(session);
  const where: Record<string, unknown> = {};

  if (scope) {
    where.serviceId = scope;
  } else if (serviceId) {
    where.serviceId = serviceId;
  }

  if (upcoming) {
    const days = parseInt(upcoming);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    where.expiryDate = { lte: futureDate };
  }

  const certificates = await prisma.complianceCertificate.findMany({
    where,
    include: {
      service: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, name: true, email: true } },
    },
    orderBy: { expiryDate: "asc" },
  });

  return NextResponse.json(certificates);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createCertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const cert = await prisma.complianceCertificate.create({
    data: {
      serviceId: parsed.data.serviceId,
      userId: parsed.data.userId || null,
      type: parsed.data.type,
      label: parsed.data.label || null,
      issueDate: new Date(parsed.data.issueDate),
      expiryDate: new Date(parsed.data.expiryDate),
      notes: parsed.data.notes || null,
      alertDays: parsed.data.alertDays ?? 30,
    },
    include: {
      service: { select: { id: true, name: true, code: true } },
      user: { select: { id: true, name: true, email: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "ComplianceCertificate",
      entityId: cert.id,
      details: { type: cert.type, serviceId: cert.serviceId },
    },
  });

  return NextResponse.json(cert, { status: 201 });
}
