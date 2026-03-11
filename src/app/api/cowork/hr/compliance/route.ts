import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";

/**
 * GET /api/cowork/hr/compliance
 *
 * Returns compliance certificate data for all active staff.
 * Scope: hr:read
 *
 * Query params:
 *   - serviceId (optional)
 *   - status: "valid" | "expiring" | "expired" | "all" (default "all")
 *   - type: CertificateType filter (optional)
 */
export async function GET(req: NextRequest) {
  const { error: authError } = await authenticateApiKey(req, "hr:read");
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const status = searchParams.get("status") || "all";
  const type = searchParams.get("type");

  try {
    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const where: Record<string, unknown> = {};
    if (serviceId) where.serviceId = serviceId;
    if (type) where.type = type;

    // Status filter
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
        user: { select: { id: true, name: true, email: true, active: true } },
        service: { select: { id: true, name: true, code: true } },
      },
      orderBy: { expiryDate: "asc" },
    });

    const results = certs.map((c) => {
      const daysUntilExpiry = Math.ceil(
        (c.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
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
          ? { id: c.user.id, name: c.user.name, email: c.user.email, active: c.user.active }
          : null,
        service: { id: c.service.id, name: c.service.name, code: c.service.code },
      };
    });

    // Summary stats
    const expired = results.filter((r) => r.status === "expired").length;
    const expiring = results.filter((r) => r.status === "expiring").length;
    const valid = results.filter((r) => r.status === "valid").length;

    return NextResponse.json({
      certificates: results,
      count: results.length,
      summary: { valid, expiring, expired },
    });
  } catch (err) {
    console.error("[Cowork HR Compliance GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch compliance data" },
      { status: 500 },
    );
  }
}
