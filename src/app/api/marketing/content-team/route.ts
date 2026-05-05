import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { ContentTeamRole, ContentTeamStatus } from "@prisma/client";
import { resolveAllMilestones } from "@/lib/content-team-milestones";

const createSchema = z.object({
  name: z.string().min(1, "Name is required"),
  role: z.nativeEnum(ContentTeamRole),
  status: z.nativeEnum(ContentTeamStatus).optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
  startedAt: z.string().optional(),
});

export const GET = withApiAuth(
  async () => {
    const members = await prisma.contentTeamMember.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
    });

    const milestoneInputs = members.map((m) => ({
      role: m.role,
      status: m.status,
    }));
    const { resetStartDate, milestones } = resolveAllMilestones(milestoneInputs, new Date());

    return NextResponse.json({ members, milestones, resetStartDate });
  },
  { roles: ["marketing", "owner"] },
);

export const POST = withApiAuth(
  async (req) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const member = await prisma.contentTeamMember.create({
      data: {
        name: parsed.data.name,
        role: parsed.data.role,
        status: parsed.data.status ?? "prospect",
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        notes: parsed.data.notes ?? null,
        startedAt: parsed.data.startedAt ? new Date(parsed.data.startedAt) : null,
      },
    });

    return NextResponse.json(member, { status: 201 });
  },
  { roles: ["marketing", "owner"] },
);
