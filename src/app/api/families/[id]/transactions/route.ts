/**
 * GET /api/families/:id/transactions — a family's account ledger.
 *
 * Every charge and every payment in one chronological list with a running
 * balance, which is the view staff actually need when a parent rings
 * asking "what am I paying for?". Statements alone don't answer that —
 * they show what was billed but not what was received against it.
 *
 * All arithmetic in integer cents via src/lib/money.ts. The underlying
 * columns are Float, so summing them directly drifts.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";
import { toCents } from "@/lib/money";

type Ctx = { params: Promise<{ id: string }> };

interface LedgerEntry {
  id: string;
  date: string;
  kind: "charge" | "payment";
  description: string;
  reference: string | null;
  serviceName: string | null;
  status: string | null;
  /** Positive = owed by the family, negative = paid/credited. */
  amountCents: number;
  balanceCents: number;
}

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context as unknown as Ctx).params;

    const account = await prisma.parentAccount.findUnique({
      where: { id },
      select: { id: true, email: true },
    });
    if (!account) throw ApiError.notFound("Family not found");

    // A family's billing records hang off CentreContact, which is matched
    // by email — there's no foreign key from ParentAccount. A family with
    // children at two centres has one contact per service, hence findMany.
    const contacts = await prisma.centreContact.findMany({
      where: { email: account.email },
      select: { id: true },
    });
    const contactIds = contacts.map((c) => c.id);

    if (contactIds.length === 0) {
      return NextResponse.json({
        entries: [],
        balanceCents: 0,
        chargedCents: 0,
        paidCents: 0,
      });
    }

    const [statements, payments] = await Promise.all([
      prisma.statement.findMany({
        where: {
          contactId: { in: contactIds },
          // Drafts and voids never hit a family's account. Including a
          // draft would show a charge nobody has been asked to pay.
          status: { notIn: ["draft", "void"] },
        },
        select: {
          id: true,
          totalFees: true,
          gapFee: true,
          issuedAt: true,
          createdAt: true,
          periodStart: true,
          periodEnd: true,
          status: true,
          service: { select: { name: true } },
        },
      }),
      prisma.payment.findMany({
        where: { contactId: { in: contactIds } },
        select: {
          id: true,
          amount: true,
          method: true,
          reference: true,
          receivedAt: true,
          service: { select: { name: true } },
        },
      }),
    ]);

    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const raw: Omit<LedgerEntry, "balanceCents">[] = [
      ...statements.map((s) => ({
        id: s.id,
        // Issued date is when the family was actually asked to pay; fall
        // back to created only when it was never stamped.
        date: (s.issuedAt ?? s.createdAt).toISOString(),
        kind: "charge" as const,
        description: `Invoice ${fmt(s.periodStart)} – ${fmt(s.periodEnd)}`,
        reference: s.id.slice(-6),
        serviceName: s.service?.name ?? null,
        status: s.status,
        // The family owes the GAP, not the full fee — CCS covers the rest.
        // Charging totalFees here would overstate every account by the
        // subsidy amount.
        amountCents: toCents(s.gapFee ?? s.totalFees),
      })),
      ...payments.map((p) => ({
        id: p.id,
        date: p.receivedAt.toISOString(),
        kind: "payment" as const,
        description: `Payment — ${String(p.method).replace(/_/g, " ")}`,
        reference: p.reference ?? null,
        serviceName: p.service?.name ?? null,
        status: null,
        amountCents: -toCents(p.amount),
      })),
    ];

    // Oldest first so the running balance accumulates correctly; the UI
    // reverses for display.
    raw.sort((a, b) => a.date.localeCompare(b.date));

    let running = 0;
    const entries: LedgerEntry[] = raw.map((e) => {
      running += e.amountCents;
      return { ...e, balanceCents: running };
    });

    const chargedCents = raw
      .filter((e) => e.kind === "charge")
      .reduce((a, e) => a + e.amountCents, 0);
    const paidCents = -raw
      .filter((e) => e.kind === "payment")
      .reduce((a, e) => a + e.amountCents, 0);

    return NextResponse.json({
      entries,
      balanceCents: running,
      chargedCents,
      paidCents,
    });
  },
  { roles: ["owner", "head_office", "admin"] },
);
