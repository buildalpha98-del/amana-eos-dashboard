import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { WhatsAppNonPostReason } from "@prisma/client";
import { isWeekday, startOfDayUTC } from "@/lib/whatsapp-compliance";

const entrySchema = z.object({
  serviceId: z.string().min(1),
  posted: z.boolean(),
  notPostingReason: z.nativeEnum(WhatsAppNonPostReason).optional(),
  notes: z.string().max(2000).optional(),
});

const bodySchema = z.object({
  date: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid date" }),
  entries: z.array(entrySchema).min(1, "At least one entry required"),
});

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const date = startOfDayUTC(new Date(parsed.data.date));
    if (!isWeekday(date)) {
      throw ApiError.badRequest("Quick entry only accepts Mon–Fri dates");
    }

    const { entries } = parsed.data;
    const serviceIds = entries.map((e) => e.serviceId);
    const existingServices = await prisma.service.findMany({
      where: { id: { in: serviceIds } },
      select: { id: true },
    });
    const validServiceIds = new Set(existingServices.map((s) => s.id));
    const missing = serviceIds.filter((id) => !validServiceIds.has(id));
    if (missing.length > 0) {
      throw ApiError.badRequest("Unknown serviceId(s)", { missing });
    }

    const results = await prisma.$transaction(
      entries.map((entry) =>
        prisma.whatsAppCoordinatorPost.upsert({
          where: { serviceId_postedDate: { serviceId: entry.serviceId, postedDate: date } },
          create: {
            serviceId: entry.serviceId,
            postedDate: date,
            posted: entry.posted,
            notPostingReason: entry.posted ? null : entry.notPostingReason ?? null,
            notes: entry.notes ?? null,
            recordedById: session.user.id,
          },
          update: {
            posted: entry.posted,
            notPostingReason: entry.posted ? null : entry.notPostingReason ?? null,
            notes: entry.notes ?? null,
            recordedById: session.user.id,
          },
        }),
      ),
    );

    return NextResponse.json({ saved: results.length });
  },
  { roles: ["marketing", "owner"] },
);
