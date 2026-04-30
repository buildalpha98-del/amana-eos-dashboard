import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

const ROLES: ("marketing" | "owner" | "head_office" | "admin")[] = ["marketing", "owner", "head_office", "admin"];

/**
 * GET /api/marketing/vendor-contacts
 *
 * Lightweight list of active vendor contacts for the brief-form dropdown.
 * Sorted: Jinan-style "internal" contacts first (by company === "Amana OSHC"),
 * then external vendors alphabetically.
 */
export const GET = withApiAuth(
  async () => {
    const contacts = await prisma.vendorContact.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        role: true,
        defaultForTypes: true,
      },
      orderBy: [{ company: "asc" }, { name: "asc" }],
    });
    return NextResponse.json({ contacts });
  },
  { roles: ROLES },
);
