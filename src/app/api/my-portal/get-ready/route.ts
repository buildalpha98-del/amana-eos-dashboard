/**
 * GET /api/my-portal/get-ready — the facts behind the "Get ready for your
 * first shift" checklist (src/lib/get-ready-steps.ts turns them into
 * steps). One request so the My Portal home page doesn't fan out.
 *
 * Side effect, deliberately: enrols the user in any published essential
 * course they're missing (ensureEssentialEnrolments) — otherwise the
 * training step counts courses My Training can't show.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getOrgSettings } from "@/lib/org-settings";
import { getRequiredCertTypes } from "@/lib/cert-requirements";
import type { RequiredCertType } from "@/lib/org-settings-shared";
import { outstandingRequiredPolicies, REQUIRED_POLICY_TITLES } from "@/lib/induction";
import { ensureEssentialEnrolments } from "@/lib/essential-enrolment";
import { getEmployee, isConfigured } from "@/lib/eh-payroll";
import { logger } from "@/lib/logger";
import type { GetReadyInput, InductionStatus } from "@/lib/get-ready-steps";

// Every RequiredCertType gets a human name — a raw "child_protection"
// leaked onto Daniel's phone on 2026-10-08. The Record type makes a new
// type in org-settings-shared fail the build until it's named here.
const CERT_LABELS: Record<RequiredCertType, string> = {
  wwcc: "Working With Children Check",
  first_aid: "First Aid",
  cpr: "CPR",
  anaphylaxis: "Anaphylaxis",
  asthma: "Asthma",
  police_check: "Police Check",
  annual_review: "Annual Review",
  child_protection: "Child Protection training",
  geccko: "GECCKO training",
  food_safety: "Food Safety",
  food_handler: "Food Handler",
  mandatory_reporter_training: "Mandatory Reporter training",
  child_safe_code_of_conduct: "Child Safe Code of Conduct",
};

export const GET = withApiAuth(async (_req, session) => {
  const userId = session!.user.id;
  await ensureEssentialEnrolments(userId);

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      avatar: true,
      phone: true,
      isCentreAccount: true,
      inductionStatus: true,
      employmentHeroEmployeeId: true,
      handbookReadAt: true,
      amanaWayReadAt: true,
      _count: { select: { emergencyContacts: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const now = new Date();
  const orgSettings = await getOrgSettings().catch(() => null);
  const required = getRequiredCertTypes(user.role, orgSettings, {
    isCentreAccount: user.isCentreAccount,
  });
  // No matrix configured for the role → at least the WWCC (what the
  // induction gate has always asked for).
  const requiredTypes: string[] = required.length ? required : ["wwcc"];

  const [contract, certs, policiesOutstanding, keyPolicyCount, essentials, practicalItems, signoffs] =
    await Promise.all([
      prisma.employmentContract.findFirst({
        where: { userId, status: "active" },
        select: { acknowledgedByStaff: true },
      }),
      prisma.complianceCertificate.findMany({
        where: {
          userId,
          supersededAt: null,
          type: { in: requiredTypes as never[] },
          OR: [{ expiryDate: null }, { expiryDate: { gte: now } }],
        },
        select: { type: true },
      }),
      outstandingRequiredPolicies(userId),
      prisma.policyDocument.count({
        where: {
          isArchived: false,
          OR: [{ keyPolicy: true }, { title: { in: REQUIRED_POLICY_TITLES } }],
        },
      }),
      prisma.lMSCourse.findMany({
        where: { track: "essential", status: "published", deleted: false },
        select: { id: true, enrollments: { where: { userId }, select: { status: true } } },
      }),
      prisma.practicalChecklistItem.count({ where: { active: true } }),
      prisma.practicalSignoff.count({ where: { userId, item: { active: true } } }),
    ]);

  // Payroll: live from Employment Hero. Unreachable → not applicable rather
  // than a false "still needed".
  let payroll: GetReadyInput["payroll"] = { applicable: false, linked: false, complete: false };
  if (isConfigured() && !user.isCentreAccount) {
    if (user.employmentHeroEmployeeId === null) {
      payroll = { applicable: true, linked: false, complete: false };
    } else {
      try {
        const emp = await getEmployee(user.employmentHeroEmployeeId);
        payroll = { applicable: true, linked: true, complete: emp.status === "Active" };
      } catch (err) {
        logger.warn("get-ready: EH lookup failed", { userId, err });
      }
    }
  }

  const detailsMissing: string[] = [];
  if (!user.avatar) detailsMissing.push("a profile photo");
  if (!user.phone) detailsMissing.push("your phone number");
  if (user._count.emergencyContacts === 0) detailsMissing.push("an emergency contact");

  const held = new Set(certs.map((c) => c.type as string));
  const input: GetReadyInput = {
    status: (user.inductionStatus ?? "cleared") as InductionStatus,
    contract,
    details: { missing: detailsMissing },
    payroll,
    documents: {
      missing: requiredTypes
        .filter((t) => !held.has(t))
        .map((t) => CERT_LABELS[t as RequiredCertType] ?? t.replace(/_/g, " ")),
    },
    reading: {
      handbook: !!user.handbookReadAt,
      amanaWay: !!user.amanaWayReadAt,
    },
    keyPolicies: { total: keyPolicyCount, outstanding: policiesOutstanding },
    training: {
      total: essentials.length,
      remaining: essentials.filter((c) => c.enrollments[0]?.status !== "completed").length,
    },
    practical: { items: practicalItems, allSigned: practicalItems > 0 && signoffs >= practicalItems },
  };
  return NextResponse.json(input);
});
