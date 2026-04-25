import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { WhatsAppNonPostReason } from "@prisma/client";
import { isWeekday, startOfDayUTC } from "@/lib/whatsapp-compliance";

const bodySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid date" }),
  posted: z.boolean(),
  notPostingReason: z.nativeEnum(WhatsAppNonPostReason).optional(),
  notes: z.string().max(2000).optional(),
});

export const PATCH = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const date = startOfDayUTC(new Date(parsed.data.date));
    if (!isWeekday(date)) {
      throw ApiError.badRequest("Cell edits only accept Mon–Fri dates");
    }

    const service = await prisma.service.findUnique({ where: { id: parsed.data.serviceId }, select: { id: true } });
    if (!service) throw ApiError.notFound("Service not found");

    const record = await prisma.whatsAppCoordinatorPost.upsert({
      where: { serviceId_postedDate: { serviceId: parsed.data.serviceId, postedDate: date } },
      create: {
        serviceId: parsed.data.serviceId,
        postedDate: date,
        posted: parsed.data.posted,
        notPostingReason: parsed.data.posted ? null : parsed.data.notPostingReason ?? null,
        notes: parsed.data.notes ?? null,
        recordedById: session.user.id,
      },
      update: {
        posted: parsed.data.posted,
        notPostingReason: parsed.data.posted ? null : parsed.data.notPostingReason ?? null,
        notes: parsed.data.notes ?? null,
        recordedById: session.user.id,
      },
    });

    return NextResponse.json({
      id: record.id,
      serviceId: record.serviceId,
      date: record.postedDate.toISOString().slice(0, 10),
      posted: record.posted,
      notPostingReason: record.notPostingReason,
      notes: record.notes,
    });
  },
  { roles: ["marketing", "owner"] },
);
