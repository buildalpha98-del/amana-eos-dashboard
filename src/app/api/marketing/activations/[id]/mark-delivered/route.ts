import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  deliveredAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid deliveredAt" }).optional(),
  undo: z.boolean().optional(),
});

export const POST = withApiAuth(
  async (req, _session, context) => {
    const params = await context?.params;
    const id = params?.id;
    if (!id) throw ApiError.badRequest("activation id required");

    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    const existing = await prisma.campaignActivationAssignment.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound("Activation not found");

    const updated = await prisma.campaignActivationAssignment.update({
      where: { id },
      data: parsed.data.undo
        ? { activationDeliveredAt: null, status: "pending" }
        : {
            activationDeliveredAt: parsed.data.deliveredAt ? new Date(parsed.data.deliveredAt) : new Date(),
            status: "delivered",
          },
      select: { id: true, activationDeliveredAt: true, status: true },
    });

    return NextResponse.json({
      id: updated.id,
      activationDeliveredAt: updated.activationDeliveredAt?.toISOString() ?? null,
      status: updated.status,
    });
  },
  { roles: ["marketing", "owner"] },
);
