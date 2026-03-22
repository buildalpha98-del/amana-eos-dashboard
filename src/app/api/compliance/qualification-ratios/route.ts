import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
/**
 * GET /api/compliance/qualification-ratios
 *
 * Per-centre qualification ratio breakdown:
 * educator count, Cert III %, Diploma+ %, 50% compliance indicator
 */
export const GET = withApiAuth(async (req, session) => {
  const services = await prisma.service.findMany({
    where: { status: "active" },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const results = await Promise.all(
    services.map(async (service) => {
      // Get all active staff for this service with qualifications
      const staff = await prisma.user.findMany({
        where: { serviceId: service.id, active: true },
        select: {
          id: true,
          name: true,
          qualifications: {
            select: { type: true },
          },
        },
      });

      const totalStaff = staff.length;
      let certIIICount = 0;
      let diplomaCount = 0;
      let bachelorCount = 0;
      let wwccCount = 0;
      let firstAidCount = 0;

      for (const s of staff) {
        const types = s.qualifications.map((q) => q.type);

        if (types.includes("cert_iii")) certIIICount++;
        if (types.includes("diploma")) diplomaCount++;
        if (types.includes("bachelor") || types.includes("masters")) bachelorCount++;
        if (types.includes("wwcc")) wwccCount++;
        if (types.includes("first_aid")) firstAidCount++;
      }

      const diplomaPlusCount = diplomaCount + bachelorCount;
      const diplomaPlusPercent = totalStaff > 0 ? (diplomaPlusCount / totalStaff) * 100 : 0;
      const certIIIPercent = totalStaff > 0 ? (certIIICount / totalStaff) * 100 : 0;
      const wwccPercent = totalStaff > 0 ? (wwccCount / totalStaff) * 100 : 0;
      const firstAidPercent = totalStaff > 0 ? (firstAidCount / totalStaff) * 100 : 0;

      // 50% rule: at least half of educators must hold diploma+
      const fiftyPercentCompliant = diplomaPlusPercent >= 50;

      return {
        service: { id: service.id, name: service.name, code: service.code },
        totalStaff,
        certIIICount,
        diplomaCount,
        bachelorCount,
        diplomaPlusCount,
        certIIIPercent: Math.round(certIIIPercent * 10) / 10,
        diplomaPlusPercent: Math.round(diplomaPlusPercent * 10) / 10,
        wwccCount,
        wwccPercent: Math.round(wwccPercent * 10) / 10,
        firstAidCount,
        firstAidPercent: Math.round(firstAidPercent * 10) / 10,
        fiftyPercentCompliant,
      };
    })
  );

  // Network summary
  const networkTotals = results.reduce(
    (acc, r) => ({
      totalStaff: acc.totalStaff + r.totalStaff,
      certIIICount: acc.certIIICount + r.certIIICount,
      diplomaPlusCount: acc.diplomaPlusCount + r.diplomaPlusCount,
      wwccCount: acc.wwccCount + r.wwccCount,
      firstAidCount: acc.firstAidCount + r.firstAidCount,
      compliantCentres: acc.compliantCentres + (r.fiftyPercentCompliant ? 1 : 0),
    }),
    { totalStaff: 0, certIIICount: 0, diplomaPlusCount: 0, wwccCount: 0, firstAidCount: 0, compliantCentres: 0 }
  );

  return NextResponse.json({
    centres: results,
    network: {
      ...networkTotals,
      totalCentres: results.length,
      diplomaPlusPercent:
        networkTotals.totalStaff > 0
          ? Math.round((networkTotals.diplomaPlusCount / networkTotals.totalStaff) * 1000) / 10
          : 0,
    },
  });
});
