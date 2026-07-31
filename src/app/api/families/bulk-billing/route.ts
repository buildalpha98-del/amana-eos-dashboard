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

    const result = await prisma.parentAccount.updateMany({
      where: b.allActive ? {} : { id: { in: ids } },
      data,
    });

    // Bulk billing changes are exactly the kind of thing someone needs to
    // reconstruct later ("why is everyone being debited on a Thursday?").
    logger.info("Bulk billing update", {
      userId: session?.user?.id,
      scope: b.allActive ? "all" : `${ids.length} selected`,
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
