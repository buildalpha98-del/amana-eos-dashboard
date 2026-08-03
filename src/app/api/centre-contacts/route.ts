/**
 * GET /api/centre-contacts — billing contacts (families) for a service.
 *
 * CentreContact is the entity statements and payments hang off, but
 * nothing exposed a LIST of them. The consequence, found 2026-08-01: the
 * "New Statement" dialog asks staff to type a raw Contact ID and Service
 * ID into text boxes — cuids, from memory. In practice that makes
 * creating a statement in this system unusable, which is a large part of
 * why invoicing still happens elsewhere.
 *
 * Deliberately a thin list: id, name, email, and the service. Enough to
 * populate a picker, nothing that would make this a way to bulk-export
 * family contact details.
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { getServiceScope } from "@/lib/service-scope";

export const GET = withApiAuth(
  async (req, session) => {
    const { searchParams } = new URL(req.url);
    const requested = searchParams.get("serviceId")?.trim() || null;
    const search = searchParams.get("search")?.trim() || null;

    // A Director of Service sees their centre's families only. Asking for
    // another centre returns nothing rather than silently widening.
    const scopedServiceId = getServiceScope(session);
    if (requested && scopedServiceId && requested !== scopedServiceId) {
      return NextResponse.json({ contacts: [] });
    }
    const serviceId = requested ?? scopedServiceId ?? null;

    const contacts = await prisma.centreContact.findMany({
      where: {
        ...(serviceId ? { serviceId } : {}),
        ...(search
          ? {
              OR: [
                { firstName: { contains: search, mode: "insensitive" as const } },
                { lastName: { contains: search, mode: "insensitive" as const } },
                { email: { contains: search, mode: "insensitive" as const } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        service: { select: { id: true, name: true } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      take: 500,
    });

    return NextResponse.json({
      contacts: contacts.map((c) => ({
        id: c.id,
        name: [c.firstName, c.lastName].filter(Boolean).join(" ") || null,
        // The picker labels by family name; fall back to the email so a
        // contact with no name entered is still selectable rather than
        // rendering as a blank row.
        familyName: c.lastName || null,
        email: c.email,
        serviceId: c.service?.id ?? null,
        serviceName: c.service?.name ?? null,
      })),
    });
  },
  { roles: ["owner", "head_office", "admin", "member"] },
);
