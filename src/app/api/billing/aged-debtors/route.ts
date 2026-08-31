/**
 * GET /api/billing/aged-debtors — who owes what, bucketed by age.
 *
 * 2026-07-31, first piece of the OWNA billing replacement.
 *
 * Computed from real Statements, NOT the manually-imported
 * OverdueFeeRecord register behind /api/billing/overdue. That register was
 * a stopgap for debt that lived in OWNA, and it has no page at all — its
 * CRUD and importer are unreachable (2026-08-01 orphan sweep). This
 * answers the same question from invoices this system actually issued.
 *
 * Only ISSUED statements count. A draft is not a debt — including drafts
 * would show families owing money they've never been asked for.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";
import {
  AGED_BUCKETS,
  ageDebts,
  bucketFor,
  daysOverdue,
  toCents,
  type AgedBucketKey,
} from "@/lib/money";

/**
 * Statuses that represent a real, chaseable debt.
 *
 * NOT `draft` — a draft has never been sent, so showing it as owing would
 * have staff chasing money nobody has been asked for. NOT `paid` or
 * `void` either. Matches the StatementStatus enum exactly.
 */
const CHASEABLE: string[] = ["issued", "unpaid", "overdue"];

export const GET = withApiAuth(
  async (req, session) => {
    const { searchParams } = new URL(req.url);
    const serviceIdParam = searchParams.get("serviceId")?.trim() || null;

    // Respect centre scoping: a Director of Service must not see debt for
    // centres they don't run. Returns a single serviceId, or null for
    // org-wide roles.
    const scopedServiceId = getServiceScope(session);

    const where: Record<string, unknown> = { status: { in: CHASEABLE } };
    if (serviceIdParam) {
      if (scopedServiceId && scopedServiceId !== serviceIdParam) {
        // Asked for a centre outside their scope — return nothing rather
        // than silently widening to everything.
        return NextResponse.json({
          asOf: new Date().toISOString(),
          buckets: AGED_BUCKETS,
          totals: ageDebts([], new Date()),
          families: [],
        });
      }
      where.serviceId = serviceIdParam;
    } else if (scopedServiceId) {
      where.serviceId = scopedServiceId;
    }

    const statements = await prisma.statement.findMany({
      where,
      select: {
        id: true,
        balance: true,
        dueDate: true,
        periodStart: true,
        periodEnd: true,
        status: true,
        service: { select: { id: true, name: true } },
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            mobile: true,
          },
        },
      },
      orderBy: { dueDate: "asc" },
      take: 2000,
    });

    const asOf = new Date();

    // Group by family (CentreContact) so staff chase a person, not a
    // scattering of invoices.
    const byContact = new Map<
      string,
      {
        contactId: string;
        name: string;
        email: string | null;
        serviceName: string | null;
        oldestDays: number;
        phone: string | null;
        serviceId: string | null;
        lastContactedAt: Date | null;
        lastContactMethod: string | null;
        totals: ReturnType<typeof ageDebts>;
        statements: {
          id: string;
          balanceCents: number;
          dueDate: Date | null;
          daysOverdue: number;
          bucket: AgedBucketKey;
        }[];
      }
    >();

    for (const s of statements) {
      const cents = toCents(s.balance);
      if (cents <= 0) continue; // settled or in credit

      const key = s.contact?.id ?? `unknown:${s.id}`;
      const days = daysOverdue(s.dueDate, asOf);

      let row = byContact.get(key);
      if (!row) {
        row = {
          contactId: s.contact?.id ?? "",
          name:
            [s.contact?.firstName, s.contact?.lastName]
              .filter(Boolean)
              .join(" ") || "Unknown family",
          email: s.contact?.email ?? null,
          phone: s.contact?.mobile ?? null,
          serviceId: s.service?.id ?? null,
          serviceName: s.service?.name ?? null,
          oldestDays: days,
          lastContactedAt: null,
          lastContactMethod: null,
          totals: ageDebts([], asOf),
          statements: [],
        };
        byContact.set(key, row);
      }

      row.oldestDays = Math.max(row.oldestDays, days);
      row.totals[bucketFor(days)] += cents;
      row.totals.total += cents;
      row.statements.push({
        id: s.id,
        balanceCents: cents,
        dueDate: s.dueDate,
        daysOverdue: days,
        bucket: bucketFor(days),
      });
    }

    // When was each family last chased? One grouped query rather than
    // one per family. "Never" stays null — it's the most useful filter
    // on this page, and 1970 or "today" would both be lies.
    const contactIds = [...byContact.values()]
      .map((r) => r.contactId)
      .filter(Boolean);
    if (contactIds.length > 0) {
      const chases = await prisma.familyDebtContact.findMany({
        where: { contactId: { in: contactIds } },
        orderBy: { contactedAt: "desc" },
        select: { contactId: true, contactedAt: true, method: true },
      });
      // findMany is ordered newest-first, so the FIRST row seen per
      // family is the latest one.
      const seen = new Set<string>();
      for (const c of chases) {
        if (seen.has(c.contactId)) continue;
        seen.add(c.contactId);
        const row = byContact.get(c.contactId);
        if (row) {
          row.lastContactedAt = c.contactedAt;
          row.lastContactMethod = c.method;
        }
      }
    }

    const families = Array.from(byContact.values()).sort(
      // Oldest debt first — that's the one that needs a call today.
      (a, b) => b.oldestDays - a.oldestDays || b.totals.total - a.totals.total,
    );

    const totals = ageDebts(
      statements.map((s) => ({ dueDate: s.dueDate, balance: s.balance })),
      asOf,
    );

    return NextResponse.json({
      asOf: asOf.toISOString(),
      buckets: AGED_BUCKETS,
      totals,
      families,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
