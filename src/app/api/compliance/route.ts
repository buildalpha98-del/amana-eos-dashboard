import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";
import { parsePagination } from "@/lib/pagination";

const createCertSchema = z.object({
  serviceId: z.string().min(1),
  userId: z.string().optional().nullable(),
  type: z.enum(["wwcc", "first_aid", "anaphylaxis", "asthma", "cpr", "police_check", "annual_review", "other"]),
  label: z.string().optional().nullable(),
  issueDate: z.string().min(1),
  expiryDate: z.string().min(1),
  notes: z.string().optional().nullable(),
  alertDays: z.number().optional(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const upcoming = searchParams.get("upcoming"); // "30" = next 30 days

  const scope = getServiceScope(session);
  const role = session!.user.role as string;
  const where: Record<string, unknown> = {};

  if (scope) {
    // Staff only see their own certs; member sees their service's certs
    if (role === "staff") {
      where.userId = session!.user.id;
    } else {
      where.serviceId = scope;
    }
  } else if (serviceId) {
    where.serviceId = serviceId;
  }

  if (upcoming) {
    const days = parseInt(upcoming);
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + days);
    where.expiryDate = { lte: futureDate };
  }

  const include = {
    service: { select: { id: true, name: true, code: true } },
    user: { select: { id: true, name: true, email: true } },
  };
  const orderBy = { expiryDate: "asc" as const };

  const pagination = parsePagination(searchParams);

  if (pagination) {
    const [items, total] = await Promise.all([
      prisma.complianceCertificate.findMany({ where, include, orderBy, skip: pagination.skip, take: pagination.limit }),
      prisma.complianceCertificate.count({ where }),
    ]);
    return NextResponse.json({
      items,
      total,
      page: pagination.page,
      totalPages: Math.ceil(total / pagination.limit),
    });
  }

  const certificates = await prisma.complianceCertificate.findMany({ where, include, orderBy });
  return NextResponse.json(certificates);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const body = await req.json();
  const parsed = createCertSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0].message }, { status: 400 });
  }

  const role = session!.user.role as string;
  const isServiceScoped = role === "staff" || role === "member";

  // Staff/member: force userId to themselves and serviceId to their assigned service
  const finalServiceId = isServiceScoped ? (session!.user.serviceId as string) : parsed.data.serviceId;
  const finalUserId = isServiceScoped ? session!.user.id : (parsed.data.userId || null);

  if (!finalServiceId) {
    return NextResponse.json({ error: "Service ID is required" }, { status: 400 });
  }

  const cert = await prisma.complianceCertificate.create({
    data: {
      serviceId: finalServiceId,
      userId: finalUserId,
      type: parsed.data.type,
      label: parsed.data.label || null,
      issueDate: new Date(parsed.data.issueDate),
      expiryDate: new Date(parsed.data.expiryDate),
      notes: parsed.data.notes || null,
      alertDays: parsed.data.alertDays ?? 30,
      fileUrl: parsed.data.fileUrl || null,
      fileName: parsed.data.fileName || null,
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
