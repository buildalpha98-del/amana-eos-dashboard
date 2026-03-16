import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";

/**
 * GET /api/cowork/hr/staff
 *
 * Returns staff summary data including qualifications, retention info,
 * and employment details.
 * Scope: hr:read
 *
 * Query params:
 *   - serviceId (optional)
 *   - active: "true" | "false" | "all" (default "true")
 *   - employmentType: "casual" | "part_time" | "permanent" | "fixed_term" | "all" (default "all")
 */
export async function GET(req: NextRequest) {
  const authError = authenticateCowork(req);
  if (authError) return authError;

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const activeFilter = searchParams.get("active") || "true";
  const employmentType = searchParams.get("employmentType") || "all";

  try {
    const where: Record<string, unknown> = {};
    if (activeFilter !== "all") where.active = activeFilter === "true";
    if (serviceId) where.serviceId = serviceId;
    if (employmentType !== "all") where.employmentType = employmentType;
    // Only staff with a service assignment
    where.serviceId = serviceId ? serviceId : { not: null };

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        employmentType: true,
        startDate: true,
        probationEndDate: true,
        visaStatus: true,
        visaExpiry: true,
        service: { select: { id: true, name: true, code: true, state: true } },
        qualifications: {
          select: {
            id: true,
            type: true,
            name: true,
            expiryDate: true,
            verified: true,
          },
        },
      },
      orderBy: [{ active: "desc" }, { name: "asc" }],
    });

    const now = new Date();
    const thirtyDaysFromNow = new Date(
      now.getTime() + 30 * 24 * 60 * 60 * 1000,
    );

    const staff = users.map((u) => {
      // Tenure calculation
      const tenureMonths = u.startDate
        ? Math.floor(
            (now.getTime() - new Date(u.startDate).getTime()) /
              (1000 * 60 * 60 * 24 * 30.44),
          )
        : null;

      // Probation status
      const onProbation =
        u.probationEndDate && new Date(u.probationEndDate) > now;

      // Visa risk
      const visaExpiringSoon =
        u.visaExpiry &&
        new Date(u.visaExpiry) <= thirtyDaysFromNow &&
        new Date(u.visaExpiry) > now;
      const visaExpired = u.visaExpiry && new Date(u.visaExpiry) <= now;

      // Qualifications summary
      const quals = u.qualifications.map((q) => ({
        id: q.id,
        type: q.type,
        name: q.name,
        verified: q.verified,
        expiryDate: q.expiryDate?.toISOString() || null,
        expired: q.expiryDate ? new Date(q.expiryDate) <= now : false,
        expiringSoon:
          q.expiryDate
            ? new Date(q.expiryDate) <= thirtyDaysFromNow &&
              new Date(q.expiryDate) > now
            : false,
      }));

      // VIC diploma check
      const isVIC = u.service?.state === "VIC";
      const hasDiploma = u.qualifications.some(
        (q) =>
          ["diploma", "bachelor", "masters"].includes(q.type) && q.verified,
      );

      return {
        id: u.id,
        name: u.name,
        email: u.email,
        role: u.role,
        active: u.active,
        employmentType: u.employmentType,
        service: u.service,
        startDate: u.startDate?.toISOString() || null,
        tenureMonths,
        probation: {
          onProbation: !!onProbation,
          endDate: u.probationEndDate?.toISOString() || null,
        },
        visa: {
          status: u.visaStatus,
          expiry: u.visaExpiry?.toISOString() || null,
          expiringSoon: !!visaExpiringSoon,
          expired: !!visaExpired,
        },
        qualifications: quals,
        vicCompliant: isVIC ? hasDiploma : null,
      };
    });

    // Summary stats
    const summary = {
      total: staff.length,
      active: staff.filter((s) => s.active).length,
      inactive: staff.filter((s) => !s.active).length,
      byEmploymentType: {
        casual: staff.filter((s) => s.employmentType === "casual").length,
        partTime: staff.filter((s) => s.employmentType === "part_time").length,
        permanent: staff.filter((s) => s.employmentType === "permanent").length,
        fixedTerm: staff.filter((s) => s.employmentType === "fixed_term")
          .length,
        unset: staff.filter((s) => !s.employmentType).length,
      },
      onProbation: staff.filter((s) => s.probation.onProbation).length,
      visaExpiringSoon: staff.filter((s) => s.visa.expiringSoon).length,
      visaExpired: staff.filter((s) => s.visa.expired).length,
      qualExpiringSoon: staff.filter((s) =>
        s.qualifications.some((q) => q.expiringSoon),
      ).length,
    };

    const res = NextResponse.json({ staff, count: staff.length, summary });
    res.headers.set("Cache-Control", "public, s-maxage=60, stale-while-revalidate=120");
    return res;
  } catch (err) {
    console.error("[Cowork HR Staff GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch staff data" },
      { status: 500 },
    );
  }
}
