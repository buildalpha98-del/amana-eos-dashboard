import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * GET /api/cowork/hr/casual-pool
 *
 * Returns all casual staff with their qualifications, service assignment,
 * and availability indicators.
 * Scope: hr:read
 *
 * Query params:
 *   - serviceId (optional) — filter by home service
 *   - qualified (optional) — "diploma" to filter only diploma+ qualified casuals
 *   - active: "true" | "false" (default "true")
 */
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const qualified = searchParams.get("qualified");
  const activeFilter = searchParams.get("active") || "true";

  try {
    const where: Record<string, unknown> = {
      employmentType: "casual",
      active: activeFilter === "true",
    };
    if (serviceId) where.serviceId = serviceId;

    const casuals = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        active: true,
        startDate: true,
        visaStatus: true,
        visaExpiry: true,
        service: { select: { id: true, name: true, code: true, state: true } },
        qualifications: {
          select: {
            type: true,
            name: true,
            verified: true,
            expiryDate: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    const now = new Date();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    let pool = casuals.map((u) => {
      const hasDiploma = u.qualifications.some(
        (q) =>
          ["diploma", "bachelor", "masters"].includes(q.type) && q.verified,
      );

      const hasWWCC = u.qualifications.some(
        (q) =>
          q.type === "wwcc" &&
          q.verified &&
          (!q.expiryDate || new Date(q.expiryDate) > now),
      );

      const hasFirstAid = u.qualifications.some(
        (q) =>
          q.type === "first_aid" &&
          q.verified &&
          (!q.expiryDate || new Date(q.expiryDate) > now),
      );

      const visaOk =
        !u.visaExpiry || new Date(u.visaExpiry) > thirtyDaysFromNow;

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone,
        active: u.active,
        homeService: u.service,
        startDate: u.startDate?.toISOString() || null,
        qualifications: {
          hasDiploma,
          hasWWCC,
          hasFirstAid,
          allCurrent: hasWWCC && hasFirstAid,
          details: u.qualifications.map((q) => ({
            type: q.type,
            name: q.name,
            verified: q.verified,
            expiryDate: q.expiryDate?.toISOString() || null,
          })),
        },
        visa: {
          status: u.visaStatus,
          expiry: u.visaExpiry?.toISOString() || null,
          ok: visaOk,
        },
        readyToWork: hasWWCC && hasFirstAid && visaOk,
      };
    });

    // Filter by diploma qualification if requested
    if (qualified === "diploma") {
      pool = pool.filter((p) => p.qualifications.hasDiploma);
    }

    // Summary
    const summary = {
      total: pool.length,
      readyToWork: pool.filter((p) => p.readyToWork).length,
      withDiploma: pool.filter((p) => p.qualifications.hasDiploma).length,
      withCurrentWWCC: pool.filter((p) => p.qualifications.hasWWCC).length,
      withCurrentFirstAid: pool.filter((p) => p.qualifications.hasFirstAid)
        .length,
      visaIssues: pool.filter((p) => !p.visa.ok).length,
    };

    return NextResponse.json({ pool, count: pool.length, summary });
  } catch (err) {
    console.error("[Cowork HR Casual Pool GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch casual pool data" },
      { status: 500 },
    );
  }
}
