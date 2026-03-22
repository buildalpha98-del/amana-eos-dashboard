import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { logger } from "@/lib/logger";
const createTouchpointSchema = z.object({
  type: z.string().min(1, "Type is required"),
  channel: z.string().min(1, "Channel is required"),
  content: z.string().optional().nullable(),
  scheduledFor: z.coerce.date().optional().nullable(),
  status: z.enum(["draft", "pending_review", "approved", "sent", "failed"]).default("draft"),
});

// GET /api/enquiries/[id]/touchpoints — list touchpoints for an enquiry
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    const touchpoints = await prisma.parentEnquiryTouchpoint.findMany({
      where: { enquiryId: id },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ touchpoints });
  } catch (err) {
    logger.error("Touchpoints GET", { err });
    return NextResponse.json(
      { error: "Failed to fetch touchpoints" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });

// POST /api/enquiries/[id]/touchpoints — create a touchpoint
export const POST = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;

  try {
    const body = await req.json();
    const data = createTouchpointSchema.parse(body);

    const touchpoint = await prisma.parentEnquiryTouchpoint.create({
      data: {
        enquiryId: id,
        type: data.type,
        channel: data.channel,
        content: data.content || null,
        scheduledFor: data.scheduledFor || null,
        status: data.status,
      },
    });

    return NextResponse.json(touchpoint, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Touchpoints POST", { err });
    return NextResponse.json(
      { error: "Failed to create touchpoint" },
      { status: 500 },
    );
  }
}, { roles: ["owner", "head_office", "admin"] });
