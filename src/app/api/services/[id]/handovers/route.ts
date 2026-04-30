import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { createHandoverSchema } from "@/lib/schemas/shift-handover";

const ORG_WIDE_ROLES = new Set(["owner", "head_office"]);

function ensureServiceAccess(
  role: string,
  userServiceId: string | null | undefined,
  serviceId: string,
) {
  if (!ORG_WIDE_ROLES.has(role) && userServiceId !== serviceId) {
    throw ApiError.forbidden("You do not have access to this service");
  }
}

// GET /api/services/[id]/handovers — non-expired, 10 most recent
export const GET = withApiAuth(async (_req, session, context) => {
  const { id } = await context!.params!;
  ensureServiceAccess(session.user.role, session.user.serviceId, id);

  const items = await prisma.shiftHandover.findMany({
    where: { serviceId: id, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    take: 10,
    include: {
      author: { select: { id: true, name: true, avatar: true } },
    },
  });

  return NextResponse.json({ items });
});

// POST /api/services/[id]/handovers — 48h auto-expiry
export const POST = withApiAuth(
  async (req, session, context) => {
    const { id } = await context!.params!;
    ensureServiceAccess(session.user.role, session.user.serviceId, id);

    const body = await parseJsonBody(req);
    const parsed = createHandoverSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          error: "Validation failed",
          details: parsed.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }
    const data = parsed.data;

    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    const created = await prisma.shiftHandover.create({
      data: {
        serviceId: id,
        authorId: session.user.id,
        content: data.content,
        mentionedUserIds: data.mentionedUserIds ?? [],
        expiresAt,
      },
      include: {
        author: { select: { id: true, name: true, avatar: true } },
      },
    });

    return NextResponse.json(created, { status: 201 });
  },
  { roles: ["owner", "head_office", "admin", "member", "staff"] },
);
