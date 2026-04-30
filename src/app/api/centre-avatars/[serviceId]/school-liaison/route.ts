import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { appendUpdateLog } from "@/lib/centre-avatar/update-log";

type RouteCtx = { params: Promise<{ serviceId: string }> };

const liaisonSchema = z.object({
  occurredAt: z.coerce.date(),
  contactName: z.string().min(1).max(300),
  purpose: z.string().min(1).max(2000),
  outcome: z.string().max(4000).optional().nullable(),
  nextStep: z.string().max(2000).optional().nullable(),
  schoolCommId: z.string().optional().nullable(),
});

/**
 * POST /api/centre-avatars/[serviceId]/school-liaison
 *
 * Appends an entry to the school-liaison log. Optionally links to a
 * `SchoolComm` record if the contact corresponds to one.
 */
export const POST = withApiAuth(
  async (req, session, context) => {
    const { serviceId } = await (context as unknown as RouteCtx).params;

    const raw = await parseJsonBody(req);
    const parsed = liaisonSchema.safeParse(raw);
    if (!parsed.success) {
      throw ApiError.badRequest("Invalid liaison-log payload", parsed.error.flatten());
    }

    const avatar = await prisma.centreAvatar.findUnique({
      where: { serviceId },
      select: { id: true },
    });
    if (!avatar) throw ApiError.notFound("Centre Avatar not found for that service");

    if (parsed.data.schoolCommId) {
      const exists = await prisma.schoolComm.findUnique({
        where: { id: parsed.data.schoolCommId },
        select: { id: true },
      });
      if (!exists) throw ApiError.badRequest("Linked schoolCommId does not exist");
    }

    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.centreAvatarSchoolLiaisonLog.create({
        data: {
          centreAvatarId: avatar.id,
          occurredAt: parsed.data.occurredAt,
          contactName: parsed.data.contactName,
          purpose: parsed.data.purpose,
          outcome: parsed.data.outcome ?? null,
          nextStep: parsed.data.nextStep ?? null,
          schoolCommId: parsed.data.schoolCommId ?? null,
          createdById: session.user.id,
        },
      });
      await appendUpdateLog(tx, {
        centreAvatarId: avatar.id,
        userId: session.user.id,
        sectionsChanged: ["schoolLiaisonLog"],
        summary: `Logged school contact: ${parsed.data.contactName}`,
      });
      await tx.centreAvatar.update({
        where: { id: avatar.id },
        data: { lastUpdatedAt: new Date(), lastUpdatedById: session.user.id },
      });
      return created;
    });

    return NextResponse.json({ liaison: row });
  },
  { roles: ["marketing", "owner"] },
);
