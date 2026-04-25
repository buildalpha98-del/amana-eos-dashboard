import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import {
  buildFlagMessage,
  buildWaMeLink,
  resolveCoordinatorForService,
} from "@/lib/whatsapp-compliance";

const bodySchema = z.object({
  serviceId: z.string().min(1),
  date: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid date" }).optional(),
  context: z.enum(["one_off", "two_week_pattern"]).default("one_off"),
});

const dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function humanDay(date: Date): string {
  const day = dayLabels[date.getUTCDay()];
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${day} ${dd} ${months[date.getUTCMonth()]}`;
}

export const POST = withApiAuth(
  async (req) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const service = await prisma.service.findUnique({
      where: { id: parsed.data.serviceId },
      select: { id: true, name: true },
    });
    if (!service) throw ApiError.notFound("Service not found");

    const coord = await resolveCoordinatorForService(parsed.data.serviceId);
    const dayStr = parsed.data.date ? humanDay(new Date(parsed.data.date)) : undefined;
    const message = buildFlagMessage({
      context: parsed.data.context,
      coordinatorName: coord?.name ?? null,
      centreName: service.name,
      day: dayStr,
    });

    return NextResponse.json({
      coordinatorName: coord?.name ?? null,
      coordinatorPhone: coord?.phone ?? null,
      centreName: service.name,
      message,
      whatsappLink: buildWaMeLink(coord?.phone ?? null, message),
    });
  },
  { roles: ["marketing", "owner"] },
);
