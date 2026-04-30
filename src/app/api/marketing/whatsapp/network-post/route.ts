import { NextResponse } from "next/server";
import { z } from "zod";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { prisma } from "@/lib/prisma";
import { WhatsAppNetworkGroup } from "@prisma/client";

const bodySchema = z.object({
  group: z.nativeEnum(WhatsAppNetworkGroup),
  postedAt: z.string().refine((d) => !Number.isNaN(Date.parse(d)), { message: "Invalid postedAt" }),
  topic: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  marketingPostId: z.string().optional(),
});

export const POST = withApiAuth(
  async (req, session) => {
    const raw = await parseJsonBody(req);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());

    if (parsed.data.marketingPostId) {
      const exists = await prisma.marketingPost.findUnique({
        where: { id: parsed.data.marketingPostId },
        select: { id: true },
      });
      if (!exists) throw ApiError.badRequest("marketingPostId does not exist");
    }

    const created = await prisma.whatsAppNetworkPost.create({
      data: {
        group: parsed.data.group,
        postedAt: new Date(parsed.data.postedAt),
        topic: parsed.data.topic ?? null,
        notes: parsed.data.notes ?? null,
        marketingPostId: parsed.data.marketingPostId ?? null,
        recordedById: session.user.id,
      },
    });

    return NextResponse.json({
      id: created.id,
      group: created.group,
      postedAt: created.postedAt.toISOString(),
      topic: created.topic,
      notes: created.notes,
      marketingPostId: created.marketingPostId,
    }, { status: 201 });
  },
  { roles: ["marketing", "owner"] },
);
