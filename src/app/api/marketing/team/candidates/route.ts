import { NextResponse } from "next/server";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

/**
 * Candidates for "Add team member" — active users who are NOT already
 * on the team (or whose previous tag is `departed`).
 */
export const GET = withApiAuth(
  async () => {
    const candidates = await prisma.user.findMany({
      where: {
        active: true,
        OR: [{ contentTeamRole: null }, { contentTeamStatus: "departed" }],
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, email: true, role: true },
      take: 100,
    });
    return NextResponse.json({ candidates });
  },
  { roles: ["marketing", "owner"] },
);
