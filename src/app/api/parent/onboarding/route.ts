import { NextResponse } from "next/server";
import { z } from "zod";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OnboardingProgress {
  profile: boolean;
  medical: boolean;
  documents: boolean;
  pickups: boolean;
  installed: boolean;
}

// ---------------------------------------------------------------------------
// GET — Auto-compute onboarding progress from actual data
// ---------------------------------------------------------------------------

export const GET = withParentAuth(async (_req, { parent }) => {
  if (parent.enrolmentIds.length === 0) {
    return NextResponse.json({
      progress: { profile: false, medical: false, documents: false, pickups: false, installed: false },
      completedCount: 0,
      totalCount: 5,
    });
  }

  // Get enrolments with children
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: {
      primaryParent: true,
      serviceId: true,
      childRecords: {
        select: {
          id: true,
          medical: true,
        },
      },
    },
  });

  // 1. Profile check: phone + address filled
  const primaryParent = enrolments[0]?.primaryParent as Record<string, unknown> | null;
  const hasPhone = !!(primaryParent?.mobile || primaryParent?.phone);
  const hasAddress = !!(primaryParent?.street && primaryParent?.suburb);
  const profileComplete = hasPhone && hasAddress;

  // 2. Medical check: any child has medical data
  const childIds = enrolments.flatMap((e) => e.childRecords.map((c) => c.id));
  const medicalComplete = enrolments.some((e) =>
    e.childRecords.some((c) => {
      const med = c.medical as Record<string, unknown> | null;
      if (!med) return false;
      const conditions = med.conditions ?? med.medicalConditions;
      const allergies = med.allergies;
      return (
        (Array.isArray(conditions) && conditions.length > 0) ||
        (Array.isArray(allergies) && allergies.length > 0) ||
        !!med.immunisationStatus
      );
    })
  );

  // 3. Documents check: any ParentDocument exists
  const docCount = childIds.length > 0
    ? await prisma.parentDocument.count({ where: { childId: { in: childIds } } })
    : 0;
  const documentsComplete = docCount > 0;

  // 4. Pickups check: any AuthorisedPickup exists
  const pickupCount = childIds.length > 0
    ? await prisma.authorisedPickup.count({ where: { childId: { in: childIds }, active: true } })
    : 0;
  const pickupsComplete = pickupCount > 0;

  // 5. Installed: check stored value (can't auto-detect)
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter(Boolean))] as string[];
  let installedComplete = false;
  if (serviceIds.length > 0) {
    const contact = await prisma.centreContact.findFirst({
      where: { email: parent.email.toLowerCase(), serviceId: { in: serviceIds } },
      select: { onboardingProgress: true },
    });
    const stored = contact?.onboardingProgress as Record<string, boolean> | null;
    installedComplete = stored?.installed === true;
  }

  const progress: OnboardingProgress = {
    profile: profileComplete,
    medical: medicalComplete,
    documents: documentsComplete,
    pickups: pickupsComplete,
    installed: installedComplete,
  };

  const completedCount = Object.values(progress).filter(Boolean).length;

  return NextResponse.json({
    progress,
    completedCount,
    totalCount: 5,
  });
});

// ---------------------------------------------------------------------------
// PATCH — Mark a step as complete (for non-auto-detectable steps)
// ---------------------------------------------------------------------------

const updateSchema = z.object({
  installed: z.boolean().optional(),
});

export const PATCH = withParentAuth(async (req, { parent }) => {
  const body = await parseJsonBody(req);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    throw ApiError.badRequest("Invalid data", parsed.error.flatten().fieldErrors);
  }

  // Find parent's CentreContact
  const enrolments = await prisma.enrolmentSubmission.findMany({
    where: { id: { in: parent.enrolmentIds }, status: { not: "draft" } },
    select: { serviceId: true },
  });
  const serviceIds = [...new Set(enrolments.map((e) => e.serviceId).filter(Boolean))] as string[];

  if (serviceIds.length === 0) {
    throw ApiError.badRequest("No contact record found");
  }

  const contact = await prisma.centreContact.findFirst({
    where: { email: parent.email.toLowerCase(), serviceId: { in: serviceIds } },
    select: { id: true, onboardingProgress: true },
  });

  if (!contact) {
    throw ApiError.badRequest("No contact record found");
  }

  const existing = (contact.onboardingProgress as Record<string, boolean>) ?? {};
  const updated = { ...existing, ...parsed.data };

  await prisma.centreContact.update({
    where: { id: contact.id },
    data: { onboardingProgress: updated },
  });

  return NextResponse.json({ success: true });
});
