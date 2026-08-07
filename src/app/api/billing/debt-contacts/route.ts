/**
 * Logging that someone chased a family about money.
 *
 * The aged-debtors list could show who owed what but not whether anyone
 * had rung them, so the same family got chased twice in a week while
 * another sat at 90 days untouched. "Nobody has contacted this family"
 * is the most useful filter on a debtors list, and it needs somewhere
 * for the contact to be written down.
 *
 * GET  ?contactId= → that family's chase history, newest first.
 * POST → log one.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { getServiceScope } from "@/lib/service-scope";

export const CONTACT_METHODS = [
  "call",
  "email",
  "sms",
  "in_person",
  "letter",
] as const;

const createSchema = z.object({
  contactId: z.string().min(1),
  method: z.enum(CONTACT_METHODS),
  /** Accepted so a call made yesterday can be logged today. */
  contactedAt: z.string().datetime().optional(),
  outcome: z.string().trim().max(200).optional(),
  note: z.string().trim().max(2000).optional(),
});

/**
 * A Director of Service must not chase — or read chases for — a family
 * at a centre they don't run.
 */
async function assertContactInScope(
  session: { user: { role: string; serviceId?: string | null } },
  contactId: string,
) {
  const scopedServiceId = getServiceScope(session as never);
  if (!scopedServiceId) return; // org-wide role

  const contact = await prisma.centreContact.findUnique({
    where: { id: contactId },
    select: { serviceId: true },
  });
  if (!contact || contact.serviceId !== scopedServiceId) {
    throw ApiError.notFound("Family not found");
  }
}

export const GET = withApiAuth(
  async (req, session) => {
    const contactId = new URL(req.url).searchParams.get("contactId");
    if (!contactId) throw ApiError.badRequest("contactId is required");
    await assertContactInScope(session as never, contactId);

    const rows = await prisma.familyDebtContact.findMany({
      where: { contactId },
      orderBy: { contactedAt: "desc" },
      take: 50,
      include: { by: { select: { name: true } } },
    });

    return NextResponse.json({
      contacts: rows.map((r) => ({
        id: r.id,
        contactedAt: r.contactedAt,
        method: r.method,
        outcome: r.outcome,
        note: r.note,
        by: r.by?.name ?? null,
      })),
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);

export const POST = withApiAuth(
  async (req, session) => {
    const parsed = createSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) {
      throw ApiError.badRequest(parsed.error.issues[0].message);
    }
    const d = parsed.data;
    await assertContactInScope(session as never, d.contactId);

    const when = d.contactedAt ? new Date(d.contactedAt) : new Date();
    // A chase logged in the future would sort to the top of the history
    // and make "last contacted" read as done when it hasn't been.
    if (when.getTime() > Date.now() + 60_000) {
      throw ApiError.badRequest("That's in the future");
    }

    const created = await prisma.familyDebtContact.create({
      data: {
        contactId: d.contactId,
        method: d.method,
        contactedAt: when,
        outcome: d.outcome || null,
        note: d.note || null,
        byId: session!.user.id,
      },
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
