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

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search")?.trim().toLowerCase();

    const accounts = await prisma.parentAccount.findMany({
      where: search
        ? {
            OR: [
              { email: { contains: search, mode: "insensitive" } },
              { firstName: { contains: search, mode: "insensitive" } },
              { surname: { contains: search, mode: "insensitive" } },
            ],
          }
        : undefined,
      select: {
        id: true,
        email: true,
        firstName: true,
        surname: true,
        emailVerifiedAt: true,
        lastLoginAt: true,
        createdAt: true,
        enrolmentDraft: { select: { currentStep: true, updatedAt: true, submittedAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    // Parent emails live inside EnrolmentSubmission JSON, so the link from
    // account → enrolment is by email rather than a foreign key. Fetch once
    // and index, rather than querying per account.
    const submissions = await prisma.enrolmentSubmission.findMany({
      select: {
        id: true,
        status: true,
        createdAt: true,
        primaryParent: true,
        childRecords: { select: { id: true, firstName: true, surname: true, status: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 1000,
    });

    const byEmail = new Map<string, typeof submissions>();
    for (const sub of submissions) {
      const p = sub.primaryParent as Record<string, unknown> | null;
      const email =
        p && typeof p.email === "string" ? p.email.toLowerCase().trim() : null;
      if (!email) continue;
      const list = byEmail.get(email) ?? [];
      list.push(sub);
      byEmail.set(email, list);
    }

    const families = accounts.map((a) => {
      const subs = byEmail.get(a.email) ?? [];
      return {
        id: a.id,
        email: a.email,
        name: [a.firstName, a.surname].filter(Boolean).join(" ") || null,
        emailVerified: Boolean(a.emailVerifiedAt),
        lastLoginAt: a.lastLoginAt,
        createdAt: a.createdAt,
        enrolmentState: getParentEnrolmentState(subs),
        draftStep: a.enrolmentDraft?.currentStep ?? null,
        draftUpdatedAt: a.enrolmentDraft?.updatedAt ?? null,
        enrolmentCount: subs.length,
        children: subs.flatMap((s) =>
          s.childRecords.map((c) => ({
            id: c.id,
            name: `${c.firstName} ${c.surname}`.trim(),
            status: c.status,
          })),
        ),
      };
    });

    return NextResponse.json({ families });
  },
  { roles: ["owner", "head_office", "admin"] },
);
