/**
 * GET /api/parent/centres
 *
 * Returns the centre(s) a logged-in parent's children attend, with each
 * service's editable content payload (About narrative, hero image, key
 * contacts, daily routine, food provider, parent onboarding) merged
 * over the defaults.
 *
 * Surfaces the work in PR #113 to the parent portal — Directors of
 * Service can now customise their centre's About / contacts and parents
 * actually see those edits.
 *
 * 2026-05-16.
 */

import { NextResponse } from "next/server";
import { withParentAuth } from "@/lib/parent-auth";
import { prisma } from "@/lib/prisma";
import { mergeServiceContent } from "@/lib/service-content-shared";

export const GET = withParentAuth(async (_req, { parent }) => {
  // Look up every Service the parent's children attend. Children attendance
  // comes through `EnrolmentSubmission.childRecords[].serviceId` and the
  // JSON `children` array (for legacy enrolments without records).
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: {
      id: { in: parent.enrolmentIds },
      status: { not: "draft" },
    },
    select: {
      serviceId: true,
      childRecords: {
        select: { serviceId: true },
      },
    },
  });

  const serviceIds = new Set<string>();
  for (const e of enrolments) {
    if (e.serviceId) serviceIds.add(e.serviceId);
    for (const c of e.childRecords) {
      if (c.serviceId) serviceIds.add(c.serviceId);
    }
  }

  if (serviceIds.size === 0) {
    return NextResponse.json({ centres: [] });
  }

  const services = await prisma.service.findMany({
    where: { id: { in: Array.from(serviceIds) } },
    select: {
      id: true,
      name: true,
      code: true,
      address: true,
      suburb: true,
      state: true,
      postcode: true,
      phone: true,
      email: true,
      content: true,
    },
    orderBy: { name: "asc" },
  });

  const centres = services.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    address: [s.address, s.suburb, s.state, s.postcode]
      .filter((x) => x && x.length > 0)
      .join(", "),
    phone: s.phone,
    email: s.email,
    content: mergeServiceContent(s.content),
  }));

  return NextResponse.json({ centres });
});
