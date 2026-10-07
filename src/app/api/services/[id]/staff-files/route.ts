/**
 * GET /api/services/[id]/staff-files — every staff member at this centre
 * and their files, for the service "Documents → Staff files" tab
 * (2026-10-08, Daniel: so a coordinator has everything to hand for a
 * regulator spot check).
 *
 * Who: admin tier, or a Director of Service whose scope includes this centre
 * (canViewServiceRecords). Staff: anyone whose primary centre is this one or
 * who has an active membership here; centre mailboxes excluded.
 * What: current compliance certificates + documents assigned to them, and
 * which REQUIRED certificate types are missing for their role. Employment
 * contracts are deliberately NOT included — they carry pay rates, and a
 * spot check doesn't need them (admins still see them in Documents → Staff
 * files). Files open through the existing authorised proxies.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { canViewServiceRecords } from "@/lib/staff-access";
import { getOrgSettings } from "@/lib/org-settings";
import { getRequiredCertTypes } from "@/lib/cert-requirements";

const CERT_LABELS: Record<string, string> = {
  wwcc: "WWCC",
  first_aid: "First Aid",
  cpr: "CPR",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  police_check: "Police Check",
  annual_review: "Annual Review",
  child_protection: "Child Protection",
  geccko: "GECCKO",
  food_safety: "Food Safety",
  food_handler: "Food Handler",
  mandatory_reporter_training: "Mandatory Reporter",
  child_safe_code_of_conduct: "Child Safe Code of Conduct",
};
const label = (t: string) => CERT_LABELS[t] ?? t.replace(/_/g, " ");

export const GET = withApiAuth(async (_req, session, context) => {
  const { id: serviceId } = await context!.params!;
  if (!(await canViewServiceRecords(session!.user.id, session!.user.role, serviceId))) {
    throw ApiError.forbidden("You can only see staff files for your own centre");
  }

  const staff = await prisma.user.findMany({
    where: {
      active: true,
      isCentreAccount: false,
      OR: [
        { serviceId },
        { serviceMemberships: { some: { serviceId, status: "active" } } },
      ],
    },
    select: { id: true, name: true, role: true, avatar: true },
    orderBy: { name: "asc" },
  });
  const ids = staff.map((s) => s.id);
  const now = new Date();
  const [certs, docs, orgSettings] = await Promise.all([
    prisma.complianceCertificate.findMany({
      where: { userId: { in: ids }, supersededAt: null },
      select: { id: true, userId: true, type: true, label: true, fileUrl: true, expiryDate: true },
      orderBy: { createdAt: "desc" },
    }),
    prisma.document.findMany({
      where: { assignedToId: { in: ids }, deleted: false },
      select: { id: true, assignedToId: true, title: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
    getOrgSettings().catch(() => null),
  ]);

  return NextResponse.json({
    staff: staff.map((s) => {
      const mine = certs.filter((c) => c.userId === s.id);
      const current = new Set(
        mine.filter((c) => !c.expiryDate || c.expiryDate >= now).map((c) => c.type as string),
      );
      const required = getRequiredCertTypes(s.role, orgSettings);
      return {
        userId: s.id,
        name: s.name,
        role: s.role,
        missing: required.filter((t) => !current.has(t)).map(label),
        files: [
          ...mine
            .filter((c) => c.fileUrl)
            .map((c) => ({
              kind: "certificate" as const,
              id: c.id,
              title: c.label || label(c.type),
              expiryDate: c.expiryDate,
              expired: !!c.expiryDate && c.expiryDate < now,
              href: `/api/compliance/${c.id}/download`,
            })),
          ...docs
            .filter((d) => d.assignedToId === s.id)
            .map((d) => ({
              kind: "document" as const,
              id: d.id,
              title: d.title,
              expiryDate: null,
              expired: false,
              href: `/api/staff-documents/${d.id}`,
            })),
        ],
      };
    }),
  });
});
