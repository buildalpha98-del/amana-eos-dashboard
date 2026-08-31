/**
 * GET /api/families — parent accounts with their enrolment + children.
 *
 * 2026-07-30, per Daniel: a staff-side view of family accounts, and the
 * ability to delete a test account so he can re-run the signup flow.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getParentEnrolmentState } from "@/lib/parent-enrolment-state";
import { findEnrolmentsForEmails } from "@/lib/parent-account";

/** How many families one request returns. Reported when it's hit. */
const ACCOUNT_PAGE_SIZE = 200;

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim().toLowerCase();
    // Scopes the list to families with a child at this service — the
    // per-service Families tab. Filtered AFTER assembly rather than in the
    // account query, because the account→service link runs through the
    // enrolment's children, not a column on ParentAccount.
    const serviceId = searchParams.get("serviceId")?.trim() || null;

    /**
     * When a centre is asked for, find whose families they are FIRST.
     *
     * The service filter used to run at the very end, over a list
     * already capped at 200 accounts — so filtering to a centre didn't
     * fetch that centre's families, it filtered the 200 newest accounts
     * down to whoever happened to be there. A centre could show a
     * handful of families and look almost empty, with nothing saying
     * the list had been cut.
     *
     * A service is recorded per CHILD, so the question "which parents
     * belong to this centre" has to start from the enrolments.
     */
    let emailsAtService: string[] | null = null;
    if (serviceId) {
      const atService = await prisma.enrolmentSubmission.findMany({
        where: { childRecords: { some: { serviceId } } },
        select: { primaryParent: true, secondaryParent: true },
      });
      const emails = new Set<string>();
      for (const sub of atService) {
        for (const blob of [sub.primaryParent, sub.secondaryParent]) {
          const p = blob as Record<string, unknown> | null;
          if (p && typeof p.email === "string") {
            emails.add(p.email.toLowerCase().trim());
          }
        }
      }
      emailsAtService = [...emails];
      // No family at this centre — say so rather than falling through to
      // an unfiltered list.
      if (emailsAtService.length === 0) {
        return NextResponse.json({ families: [] });
      }
    }

    const accounts = await prisma.parentAccount.findMany({
      where: {
        ...(emailsAtService ? { email: { in: emailsAtService } } : {}),
        ...(search
          ? {
              OR: [
                { email: { contains: search, mode: "insensitive" } },
                { firstName: { contains: search, mode: "insensitive" } },
                { surname: { contains: search, mode: "insensitive" } },
                { familyName: { contains: search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        enrolmentReminderSentAt: true,
        familyName: true,
        billingFrequency: true,
        billingAnchorDay: true,
        billingLimitCents: true,
        nextBillingDate: true,
        billingWeeks: true,
        autoInvoice: true,
        pauseDebiting: true,
        deactivatedAt: true,
        enrolmentDraft: { select: { currentStep: true, updatedAt: true, submittedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: ACCOUNT_PAGE_SIZE,
    });

    /**
     * Enrolments for exactly these accounts.
     *
     * This used to fetch the newest 1000 enrolments and index them in
     * memory. Same shape as the magic-link bug: past the cap, a family
     * whose enrolment fell outside the window showed here as having no
     * enrolment and no children — indistinguishable from someone who
     * signed up and never enrolled, and so liable to be chased for
     * something they had already done. It also indexed `primaryParent`
     * only, so a family whose account email belonged to the SECOND
     * carer looked equally empty.
     *
     * Asking by the emails we actually hold accounts for makes the
     * result bounded by the page rather than by a guess.
     */
    const idsByEmail = await findEnrolmentsForEmails(
      accounts.map((a) => a.email),
    );
    const wantedIds = [...new Set([...idsByEmail.values()].flat())];

    const submissions = wantedIds.length
      ? await prisma.enrolmentSubmission.findMany({
          where: { id: { in: wantedIds } },
          select: {
            id: true,
            status: true,
            createdAt: true,
            serviceId: true,
            childRecords: {
              select: {
                id: true,
                firstName: true,
                surname: true,
                status: true,
                schoolName: true,
                service: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const subById = new Map(submissions.map((s) => [s.id, s]));
    const byEmail = new Map<string, typeof submissions>();
    for (const [email, ids] of idsByEmail) {
      byEmail.set(
        email,
        ids.map((id) => subById.get(id)).filter(Boolean) as typeof submissions,
      );
    }

    const families = accounts.map((a) => {
      const subs = byEmail.get(a.email) ?? [];
      // The service is recorded per CHILD, so read it from there rather
      // than the submission — a family can have children at two centres.
      const services = Array.from(
        new Map(
          subs
            .flatMap((s) => s.childRecords)
            .map((c) => c.service)
            .filter((sv): sv is { id: string; name: string } => Boolean(sv))
            .map((sv) => [sv.id, sv]),
        ).values(),
      );

      return {
        id: a.id,
        email: a.email,
        name: [a.firstName, a.surname].filter(Boolean).join(" ") || null,
        // Falls back to the sign-up surname for accounts that predate the
        // familyName column and haven't submitted an enrolment yet.
        familyName: a.familyName || a.surname || null,
        services,
        billing: {
          frequency: a.billingFrequency,
          anchorDay: a.billingAnchorDay,
          limitCents: a.billingLimitCents,
          nextBillingDate: a.nextBillingDate,
          weeks: a.billingWeeks,
          autoInvoice: a.autoInvoice,
          pauseDebiting: a.pauseDebiting,
        },
        deactivated: Boolean(a.deactivatedAt),
        emailVerified: Boolean(a.emailVerifiedAt),
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
        reminderSentAt: a.enrolmentReminderSentAt,
        enrolmentState: getParentEnrolmentState(subs),
        draftStep: a.enrolmentDraft?.currentStep ?? null,
        draftUpdatedAt: a.enrolmentDraft?.updatedAt ?? null,
        enrolmentCount: subs.length,
        children: subs.flatMap((s) =>
          s.childRecords.map((c) => ({
            id: c.id,
            name: `${c.firstName} ${c.surname}`.trim(),
            status: c.status,
            schoolName: c.schoolName,
            serviceName: c.service?.name ?? null,
          })),
        ),
      };
    });

    /*
     * The service scoping happened in the query above. This second pass
     * remains because an account can hold enrolments at two centres and
     * the caller asked about one — but it is now narrowing a list that
     * was already fetched for that centre, not salvaging one that
     * wasn't.
     */
    const scoped = serviceId
      ? families.filter((f) => f.services.some((sv) => sv.id === serviceId))
      : families;

    /*
     * `take: 200` above is a real limit and the UI had no way to know it
     * had been hit. Saying so beats a page that quietly stops at 200
     * families and looks complete.
     */
    return NextResponse.json({
      families: scoped,
      truncated: accounts.length === ACCOUNT_PAGE_SIZE,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
