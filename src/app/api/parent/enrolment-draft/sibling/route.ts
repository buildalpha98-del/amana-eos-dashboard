/**
 * POST /api/parent/enrolment-draft/sibling
 *
 * Re-opens the family's enrolment form to enrol ANOTHER child.
 *
 * Siblings used to go through the legacy wizard (src/components/enrol),
 * which never received the live form's fixes — second-parent DOB, action
 * plans, direct-debit-only payment. Now there is one form: this carries the
 * family's details over (parent, second carer, emergency contacts) and
 * clears what is per-child — the child, their days, and the consents, which
 * reg 161 records per child. The family re-signs and resubmits; the submit
 * route creates a NEW EnrolmentSubmission exactly as for a first child.
 *
 * An unsubmitted draft is returned untouched — never wipe work in progress.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withParentAuth } from "@/lib/parent-auth";
import { ApiError } from "@/lib/api-error";
import type { EnrolDraft } from "@/lib/enrol-draft";

const CHILD_STEP = 1;

const str = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() ? v.trim() : undefined;

/** Families who enrolled before the portal form have no draft to copy. */
function fromSubmission(sub: {
  primaryParent: unknown;
  secondaryParent: unknown;
  emergencyContacts: unknown;
}): Pick<EnrolDraft, "me" | "contacts"> {
  const pp = (sub.primaryParent ?? {}) as Record<string, unknown>;
  const sp = (sub.secondaryParent ?? null) as Record<string, unknown> | null;
  const ecs = Array.isArray(sub.emergencyContacts)
    ? (sub.emergencyContacts as Record<string, unknown>[])
    : [];
  return {
    me: {
      firstName: str(pp.firstName),
      surname: str(pp.surname),
      dob: str(pp.dob),
      mobile: str(pp.mobile),
      street: str(pp.street),
      suburb: str(pp.suburb),
      state: str(pp.state),
      postcode: str(pp.postcode),
      crn: str(pp.crn),
      languageSpoken: str(pp.languageSpoken),
      culturalBackground: str(pp.culturalBackground),
    },
    contacts: {
      secondaryParent: sp
        ? {
            firstName: str(sp.firstName),
            surname: str(sp.surname),
            dob: str(sp.dob),
            mobile: str(sp.mobile),
            email: str(sp.email),
            relationship: str(sp.relationship),
            sameAddressAsPrimary:
              sp.sameAddressAsPrimary === true || sp.livesWithPrimary === true,
            address:
              str(sp.address) ??
              ([sp.street, sp.suburb, sp.state, sp.postcode]
                .map(str)
                .filter(Boolean)
                .join(", ") ||
                undefined),
          }
        : undefined,
      emergency: ecs
        .filter((c) => str(c.name))
        .map((c) => ({
          name: str(c.name),
          relationship: str(c.relationship),
          phone: str(c.phone),
          address: str(c.address),
        })),
    },
  };
}

export const POST = withParentAuth(async (_req, ctx) => {
  const accountId = ctx.parent.accountId;
  if (!accountId) {
    throw ApiError.forbidden(
      "Please sign in with your Amana OSHC account to enrol another child.",
    );
  }

  const existing = await prisma.enrolmentDraft.findUnique({
    where: { accountId },
    select: { data: true, submittedAt: true },
  });

  // Work in progress — open it as it is.
  if (existing && !existing.submittedAt) {
    return NextResponse.json({ ok: true, reopened: false });
  }

  let carried: Pick<EnrolDraft, "me" | "contacts">;
  if (existing) {
    const d = (existing.data ?? {}) as EnrolDraft;
    carried = { me: d.me, contacts: d.contacts };
  } else {
    const latest = await prisma.enrolmentSubmission.findFirst({
      where: { id: { in: ctx.parent.enrolmentIds } },
      orderBy: { createdAt: "desc" },
      select: { primaryParent: true, secondaryParent: true, emergencyContacts: true },
    });
    carried = latest ? fromSubmission(latest) : {};
  }

  const data: EnrolDraft = {
    sibling: true,
    // The legal-carer confirmation is a fresh declaration for each child.
    me: carried.me ? { ...carried.me, isLegalCarer: false } : undefined,
    contacts: carried.contacts,
    children: [{}],
    billing: {},
    agreement: {},
  };

  await prisma.enrolmentDraft.upsert({
    where: { accountId },
    create: { accountId, data: data as object, currentStep: CHILD_STEP },
    update: { data: data as object, currentStep: CHILD_STEP, submittedAt: null },
  });

  return NextResponse.json({ ok: true, reopened: true });
});
