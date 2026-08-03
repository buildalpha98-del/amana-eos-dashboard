/**
 * POST /api/children/backfill-pickups — one-off repair.
 *
 * Until 2026-08-01 nothing created AuthorisedPickup rows on a fresh
 * enrolment; only the sibling-copy path did. So every family enrolled
 * before that has an EMPTY pickup list, despite having named a second
 * carer and emergency contacts with explicit pickup permission on their
 * form. An educator at the door has nothing to check against.
 *
 * This rebuilds those rows from the enrolment data already on file.
 *
 * IDEMPOTENT by design: a pickup is skipped when a row with the same
 * name already exists for that child, so running it twice doesn't
 * duplicate anyone. Existing rows are never modified or deleted — staff
 * may have added or corrected people by hand, and this must not undo
 * that.
 *
 * Owner-only, and reports exactly what it did rather than just "ok".
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";

interface EnrolContact {
  name?: string;
  relationship?: string;
  phone?: string;
  consentPickup?: boolean | null;
}

interface EnrolSecondary {
  firstName?: string;
  surname?: string;
  mobile?: string;
  relationship?: string;
}

/** Case/space-insensitive, so "Jane  Smith" doesn't duplicate "Jane Smith". */
const normName = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

export const POST = withApiAuth(
  async (req) => {
    const dryRun =
      new URL(req.url).searchParams.get("dryRun") === "1";

    const submissions = await prisma.enrolmentSubmission.findMany({
      where: { status: { notIn: ["draft", "rejected", "archived"] } },
      select: {
        id: true,
        secondaryParent: true,
        emergencyContacts: true,
        childRecords: { select: { id: true } },
      },
      take: 2000,
    });

    let created = 0;
    let skippedExisting = 0;
    const touchedChildren = new Set<string>();

    for (const sub of submissions) {
      if (sub.childRecords.length === 0) continue;

      const candidates: {
        name: string;
        relationship: string;
        phone: string;
        isEmergencyContact: boolean;
      }[] = [];

      const sp = sub.secondaryParent as EnrolSecondary | null;
      if (sp?.firstName?.trim() && sp?.mobile?.trim()) {
        candidates.push({
          name: [sp.firstName, sp.surname].filter(Boolean).join(" ").trim(),
          relationship: sp.relationship?.trim() || "Parent / carer",
          phone: sp.mobile.trim(),
          isEmergencyContact: false,
        });
      }

      const contacts = (sub.emergencyContacts ?? []) as EnrolContact[];
      for (const c of Array.isArray(contacts) ? contacts : []) {
        // Only people the family actually authorised. An emergency
        // contact is NOT automatically allowed to collect a child, and
        // assuming so would be a child-safety error, not a convenience.
        if (c?.consentPickup !== true) continue;
        if (!c.name?.trim() || !c.phone?.trim()) continue;
        candidates.push({
          name: c.name.trim(),
          relationship: c.relationship?.trim() || "Emergency contact",
          phone: c.phone.trim(),
          isEmergencyContact: true,
        });
      }

      if (candidates.length === 0) continue;

      for (const child of sub.childRecords) {
        const existing = await prisma.authorisedPickup.findMany({
          where: { childId: child.id },
          select: { name: true },
        });
        const have = new Set(existing.map((e) => normName(e.name)));

        const toAdd = candidates.filter((c) => !have.has(normName(c.name)));
        skippedExisting += candidates.length - toAdd.length;
        if (toAdd.length === 0) continue;

        touchedChildren.add(child.id);
        created += toAdd.length;

        if (!dryRun) {
          await prisma.authorisedPickup.createMany({
            data: toAdd.map((c) => ({
              ...c,
              childId: child.id,
              active: true,
              notes: "Added from enrolment record (backfill 2026-08-01)",
            })),
          });
        }
      }
    }

    logger.info("Authorised pickup backfill", {
      dryRun,
      submissions: submissions.length,
      created,
      skippedExisting,
      children: touchedChildren.size,
    });

    return NextResponse.json({
      ok: true,
      dryRun,
      submissionsScanned: submissions.length,
      childrenUpdated: touchedChildren.size,
      pickupsCreated: created,
      skippedAlreadyPresent: skippedExisting,
    });
  },
  { roles: ["owner"] },
);
