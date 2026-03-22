import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { authenticateCowork } from "@/app/api/_lib/auth";
import { withApiHandler } from "@/lib/api-handler";
import { logger } from "@/lib/logger";

const createTouchpointSchema = z.object({
  type: z.string().min(1, "Type is required"),
  channel: z.string().min(1, "Channel is required"),
  content: z.string().min(1, "Content is required"),
});

/**
 * POST /api/cowork/enquiries/[id]/touchpoints — Push a draft touchpoint
 * Auth: API key with "enquiries:write" scope
 */
export const POST = withApiHandler(async (req, context) => {
  const authError = await authenticateCowork(req);
  if (authError) return authError;

  const { id } = await context!.params!;

  try {
    const body = await req.json();
    const data = createTouchpointSchema.parse(body);

    // Verify the enquiry exists
    const enquiry = await prisma.parentEnquiry.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!enquiry) {
      return NextResponse.json(
        { success: false, error: "Enquiry not found" },
        { status: 404 },
      );
    }

    const touchpoint = await prisma.parentEnquiryTouchpoint.create({
      data: {
        enquiryId: id,
        type: data.type,
        channel: data.channel,
        content: data.content,
        generatedByCowork: true,
        status: "pending_review",
      },
    });

    return NextResponse.json({ success: true, touchpoint }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: err.issues[0].message },
        { status: 400 },
      );
    }
    logger.error("Cowork Touchpoints POST", { err });
    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 },
    );
  }
});
