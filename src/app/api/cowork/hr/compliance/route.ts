import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

import { parseJsonBody } from "@/lib/api-error";
const certificateSchema = z.object({
  userEmail: z.string().email().optional(),
  staffName: z.string().optional(),
  type: z.enum([
    "wwcc", "first_aid", "anaphylaxis", "asthma", "cpr",
    "police_check", "annual_review", "child_protection",
    "geccko", "food_safety", "food_handler", "other",
  ]),
  expiryDate: z.string().min(1),
  issueDate: z.string().optional(),
  label: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  fileUrl: z.string().nullable().optional(),
  alertDays: z.number().optional(),
});

const bodySchema = z.object({
  serviceCode: z.string().min(1),
  certificates: z.array(certificateSchema).min(1),
});

/**
 * POST /api/cowork/hr/compliance
 * Upserts compliance certificates for a service.
 * Used by: hr-compliance-scanner, hr-full-compliance-audit, hr-expiry-alert-generator
 */
export const POST = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  try {
    const body = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const { serviceCode, certificates } = parsed.data;

    const service = await prisma.service.findUnique({
      where: { code: serviceCode },
      select: { id: true, name: true },
    });

    if (!service) {
      return NextResponse.json(
        { error: `Service ${serviceCode} not found` },
        { status: 404 }
      );
    }

    const results = { created: 0, updated: 0, alerts: [] as string[] };

    for (const cert of certificates) {
      // Resolve user by email
      let userId: string | null = null;
      if (cert.userEmail) {
        const user = await prisma.user.findFirst({
          where: { email: cert.userEmail },
          select: { id: true },
        });
        userId = user?.id || null;
      }

      // Check if certificate exists (by service + user + type)
      const existing = userId
        ? await prisma.complianceCertificate.findFirst({
            where: { serviceId: service.id, userId, type: cert.type },
          })
        : null;

      const expiryDate = new Date(cert.expiryDate);
      const issueDate = cert.issueDate ? new Date(cert.issueDate) : new Date();

      // Flag expiring within 30 days
      const daysUntilExpiry = Math.ceil(
        (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      if (daysUntilExpiry <= 30) {
        results.alerts.push(
          `${cert.staffName || cert.userEmail} — ${cert.type} expires in ${daysUntilExpiry} days`
        );
      }

      if (existing) {
        await prisma.complianceCertificate.update({
          where: { id: existing.id },
          data: {
            issueDate,
            expiryDate,
            label: cert.label || null,
            notes: cert.notes || null,
            fileUrl: cert.fileUrl || existing.fileUrl,
            acknowledged: false,
          },
        });
        results.updated++;
      } else {
        await prisma.complianceCertificate.create({
          data: {
            serviceId: service.id,
            userId,
            type: cert.type,
            label:
              cert.label || `${cert.type} — ${cert.staffName || "Unknown"}`,
            issueDate,
            expiryDate,
            notes: cert.notes || null,
            fileUrl: cert.fileUrl || null,
            alertDays: cert.alertDays || 30,
          },
        });
        results.created++;
      }
    }

    return NextResponse.json(
      {
        message: "Compliance certificates processed",
        serviceCode,
        ...results,
      },
      { status: 201 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("POST /cowork/hr/compliance", { err });
    return NextResponse.json(
      { error: "Internal Server Error", message },
      { status: 500 }
    );
  }
});

/**
 * GET /api/cowork/hr/compliance
 * Returns compliance certificate data for all active staff.
 *
 * Query params:
 *   - serviceId (optional)
 *   - status: "valid" | "expiring" | "expired" | "all" (default "all")
 *   - type: CertificateType filter (optional)
 */
export const GET = withApiHandler(async (req) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status") || "all";
  const type = searchParams.get("type");

  try {
    const now = new Date();
    const thirtyDaysOut = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000
    );

    const where: Record<string, unknown> = {};
    if (serviceId) where.serviceId = serviceId;
    if (type) where.type = type;

    if (status === "expired") {
      where.expiryDate = { lt: now };
    } else if (status === "expiring") {
      where.expiryDate = { gte: now, lte: thirtyDaysOut };
    } else if (status === "valid") {
      where.expiryDate = { gt: thirtyDaysOut };
    }

    const certs = await prisma.complianceCertificate.findMany({
      where,
      include: {
        user: {
          select: { id: true, name: true, email: true, active: true },
        },
        service: { select: { id: true, name: true, code: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    const results = certs.map((c) => {
      const daysUntilExpiry = Math.ceil(
        (c.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      return {
        id: c.id,
        type: c.type,
        label: c.label,
        issueDate: c.issueDate.toISOString(),
        expiryDate: c.expiryDate.toISOString(),
        daysUntilExpiry,
        status:
          daysUntilExpiry < 0
            ? "expired"
            : daysUntilExpiry <= 30
              ? "expiring"
              : "valid",
        acknowledged: c.acknowledged,
        staff: c.user
          ? {
              id: c.user.id,
              name: c.user.name,
              email: c.user.email,
              active: c.user.active,
            }
          : null,
        service: {
          id: c.service.id,
          name: c.service.name,
          code: c.service.code,
        },
      };
    });

    const expired = results.filter((r) => r.status === "expired").length;
    const expiring = results.filter((r) => r.status === "expiring").length;
    const valid = results.filter((r) => r.status === "valid").length;

    const res = NextResponse.json({
      certificates: results,
      count: results.length,
      summary: { valid, expiring, expired },
    });
    res.headers.set(
      "Cache-Control",
      "public, s-maxage=60, stale-while-revalidate=120"
    );
    return res;
  } catch (err) {
    logger.error("Cowork HR Compliance GET", { err });
    return NextResponse.json(
      { error: "Failed to fetch compliance data" },
      { status: 500 }
    );
  }
});
