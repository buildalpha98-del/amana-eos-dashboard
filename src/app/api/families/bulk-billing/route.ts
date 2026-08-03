/**
 * POST /api/families/bulk-billing — apply a billing change to many
 * families at once.
 *
 * 2026-07-31, per Daniel's OWNA reference: set the next billing date and
 * period across a group, change the preferred debit day, or set/clear the
 * debit limit — without opening each family in turn.
 *
 * Deliberately NOT one endpoint per button: the three OWNA actions differ
 * only in which fields they write, and splitting them would mean three
 * copies of the same targeting and audit logic.
 *
 * Owner/head_office only. Changing when dozens of families get debited is
 * a materially bigger action than editing one, so it sits above the admin
 * role that can edit a single family.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { logger } from "@/lib/logger";
import { anchorDayValid } from "@/lib/family-billing";

const bodySchema = z.object({
  /** Explicit family ids. Empty/omitted with `allActive` means everyone. */
  familyIds: z.array(z.string()).max(2000).optional(),
  /**
   * Apply to every family instead of a selection. Must be set EXPLICITLY —
   * an empty id list will never be treated as "all", because
   * "select none, press apply" must not silently rewrite every family's
   * billing.
   */
  allActive: z.boolean().optional(),
  /**
   * Confine `allActive` to one centre's families.
   *
   * Without this, pressing "apply to all" from a service's billing page
   * would rewrite every family in the organisation — the one mistake in
   * this endpoint you couldn't undo from the UI.
   */
  serviceId: z.string().min(1).optional(),

  nextBillingDate: z.string().nullable().optional(),
  billingPeriodStart: z.string().nullable().optional(),
  billingAnchorDay: z.number().int().nullable().optional(),
  billingFrequency: z.string().nullable().optional(),
  /** Cents. null clears the cap. */
  billingLimitCents: z.number().int().min(0).max(100_000_00).nullable().optional(),
});

function parseDate(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v.trim() === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.trim())) return undefined;
  const d = new Date(`${v.trim()}T00:00:00.000Z`);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = bodySchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const b = parsed.data;

    const ids = b.familyIds ?? [];
    if (!b.allActive && ids.length === 0) {
      throw ApiError.badRequest(
        "Select at least one family, or tick 'apply to all families'.",
      );
    }

    if (
      b.billingAnchorDay !== undefined &&
      !anchorDayValid(b.billingFrequency ?? null, b.billingAnchorDay)
    ) {
      throw ApiError.badRequest(
        b.billingFrequency === "monthly"
          ? "Billing day must be between 1 and 28."
          : "Billing day must be a weekday (1 = Monday, 7 = Sunday).",
      );
    }

    const data: Record<string, unknown> = {};
    for (const [key, value] of [
      ["nextBillingDate", b.nextBillingDate],
      ["billingPeriodStart", b.billingPeriodStart],
    ] as const) {
      const d = parseDate(value);
      if (value !== undefined && d === undefined) {
        throw ApiError.badRequest(`${key} must be a date in YYYY-MM-DD format.`);
      }
      if (d !== undefined) data[key] = d;
    }
    if (b.billingAnchorDay !== undefined) {
      data.billingAnchorDay = b.billingAnchorDay;
    }
    if (b.billingFrequency !== undefined) {
      data.billingFrequency = b.billingFrequency || null;
    }
    if (b.billingLimitCents !== undefined) {
      data.billingLimitCents = b.billingLimitCents;
    }

    if (Object.keys(data).length === 0) {
      throw ApiError.badRequest("Nothing to update — set at least one field.");
    }

    // "All active" at a service means the families whose children sit
    // there, resolved through the enrolment's email join (there's no FK
    // between ParentAccount and EnrolmentSubmission).
    let scopedIds: string[] | null = null;
    if (b.allActive && b.serviceId) {
      const emails = await emailsAtService(b.serviceId);
      const accounts = await prisma.parentAccount.findMany({
        where: { email: { in: [...emails] } },
        select: { id: true },
      });
      scopedIds = accounts.map((a) => a.id);
      if (scopedIds.length === 0) {
        return NextResponse.json({ ok: true, updated: 0 });
      }
    }

    const result = await prisma.parentAccount.updateMany({
      where: scopedIds
        ? { id: { in: scopedIds } }
        : b.allActive
          ? {}
          : { id: { in: ids } },
      data,
    });

    // Bulk billing changes are exactly the kind of thing someone needs to
    // reconstruct later ("why is everyone being debited on a Thursday?").
    logger.info("Bulk billing update", {
      userId: session?.user?.id,
      scope: scopedIds
        ? `all at service ${b.serviceId}`
        : b.allActive
          ? "all"
          : `${ids.length} selected`,
      fields: Object.keys(data),
      updated: result.count,
    });

    await prisma.activityLog
      .create({
        data: {
          userId: session?.user?.id ?? null,
          action: "families_bulk_billing_update",
          entityType: "ParentAccount",
          entityId: b.allActive ? "all" : ids.join(",").slice(0, 200),
          details: JSON.parse(
            JSON.stringify({ fields: Object.keys(data), count: result.count }),
          ),
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true, updated: result.count });
  },
  { roles: ["owner", "head_office"] },
);

/**
 * Primary-parent emails of every non-withdrawn child at a service.
 *
 * Filtered in JS rather than with a Prisma JSON path filter: the email
 * lives in a JSON blob and isn't reliably normalised, so a path filter is
 * case-sensitive and quietly misses families.
 */
async function emailsAtService(serviceId: string): Promise<Set<string>> {
  const subs = await prisma.enrolmentSubmission.findMany({
    select: {
      primaryParent: true,
      childRecords: { select: { serviceId: true, status: true } },
    },
    take: 2000,
  });

  const emails = new Set<string>();
  for (const sub of subs) {
    const here = sub.childRecords.some(
      (c) => c.serviceId === serviceId && c.status !== "withdrawn",
    );
    if (!here) continue;
    const p = sub.primaryParent as Record<string, unknown> | null;
    if (p && typeof p.email === "string") {
      emails.add(p.email.toLowerCase().trim());
    }
  }
  return emails;
}
