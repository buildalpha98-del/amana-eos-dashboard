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

/**
 * Session keys this centre is currently accepting casual bookings for.
 *
 * Read permissively — an unparseable blob means "nothing enabled",
 * which shows the family no options rather than every option.
 */
function enabledCasualSessions(raw: unknown): string[] {
  if (!raw || typeof raw !== "object") return [];
  return Object.entries(raw as Record<string, unknown>)
    .filter(([key, v]) => {
      if (key === "policy" || !v || typeof v !== "object") return false;
      return (v as { enabled?: unknown }).enabled === true;
    })
    .map(([key]) => key);
}

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
      // Which programmes this centre takes casual bookings for. Parents
      // must only ever be offered a programme the centre has turned ON —
      // otherwise Holiday Quest (and any unused extra room) shows up as
      // bookable at a centre that doesn't run it.
      casualBookingSettings: true,
      // Room names, hours and fees. Parents see "Rise and Shine
      // (6:30am – 9:00am)", not "BSC" — the labels are per-centre, so
      // they have to travel with the centre rather than be hardcoded
      // in the booking form.
      sessionTimes: true,
    },
    orderBy: { name: "asc" },
  });

  // Resolve the policy documents each centre has selected. Fetched in one
  // query across all of them, and filtered to category "policy" here so a
  // stale id pointing at some other document can't leak an HR file into a
  // parent's portal.
  const wantedPolicyIds = new Set<string>();
  const contentByService = new Map(
    services.map((s) => {
      const merged = mergeServiceContent(s.content);
      for (const id of merged.policyDocumentIds) wantedPolicyIds.add(id);
      return [s.id, merged];
    }),
  );

  const policyDocs =
    wantedPolicyIds.size > 0
      ? await prisma.document.findMany({
          where: {
            id: { in: [...wantedPolicyIds] },
            category: "policy",
            deleted: false,
          },
          select: { id: true, title: true, fileUrl: true, fileName: true },
        })
      : [];
  const policyById = new Map(policyDocs.map((d) => [d.id, d]));

  const centres = services.map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    address: [s.address, s.suburb, s.state, s.postcode]
      .filter((x) => x && x.length > 0)
      .join(", "),
    phone: s.phone,
    email: s.email,
    content: contentByService.get(s.id)!,
    casualSessions: enabledCasualSessions(s.casualBookingSettings),
    // Order follows the admin's selection, not the database's.
    policies: (contentByService.get(s.id)?.policyDocumentIds ?? [])
      .map((id) => policyById.get(id))
      .filter((d): d is NonNullable<typeof d> => Boolean(d))
      .map((d) => ({
        id: d.id,
        name: d.title,
        fileUrl: d.fileUrl,
        fileName: d.fileName,
      })),
    sessionTimes: s.sessionTimes,
  }));

  return NextResponse.json({ centres });
});
