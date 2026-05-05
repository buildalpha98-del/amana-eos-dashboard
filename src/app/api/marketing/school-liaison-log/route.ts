import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const CHANNELS = ["phone", "email", "in_person", "whatsapp", "other"] as const;

const createSchema = z.object({
  serviceId: z.string().min(1),
  contactName: z.string().min(1, "Contact name is required"),
  channel: z.enum(CHANNELS),
  summary: z.string().min(1).max(1000),
  loggedAt: z.string().optional(),
});

export const GET = withApiAuth(
  async (req) => {
    const { searchParams } = req.nextUrl;
    const serviceId = searchParams.get("serviceId");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 100);

    const logs = await prisma.schoolLiaisonLog.findMany({
      where: serviceId ? { serviceId } : undefined,
      include: { service: { select: { id: true, name: true } } },
      orderBy: { loggedAt: "desc" },
      take: limit,
    });

    return NextResponse.json(logs);
  },
  { roles: ["marketing", "owner"] },
);

export const POST = withApiAuth(
  async (req) => {
    const raw = await parseJsonBody(req);
    const parsed = createSchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const service = await prisma.service.findUnique({ where: { id: parsed.data.serviceId } });
    if (!service) throw ApiError.notFound("Service not found");

    const log = await prisma.schoolLiaisonLog.create({
      data: {
        serviceId: parsed.data.serviceId,
        contactName: parsed.data.contactName,
        channel: parsed.data.channel,
        summary: parsed.data.summary,
        loggedAt: parsed.data.loggedAt ? new Date(parsed.data.loggedAt) : new Date(),
      },
      include: { service: { select: { id: true, name: true } } },
    });

    return NextResponse.json(log, { status: 201 });
  },
  { roles: ["marketing", "owner"] },
);
