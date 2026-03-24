import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const reorderSchema = z.object({
  serviceId: z.string().min(1, "serviceId is required"),
  orderedIds: z.array(z.string().min(1)).min(1, "orderedIds must not be empty"),
});

/**
 * POST /api/waitlist/reorder — reorder the waitlist for a service
 */
export const POST = withApiAuth(async (req: NextRequest) => {
  const body = await parseJsonBody(req);
  const { serviceId, orderedIds } = reorderSchema.parse(body);

  // Update positions in a transaction
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.parentEnquiry.update({
        where: { id },
        data: { waitlistPosition: index + 1 },
      }),
    ),
  );

  return NextResponse.json({
    success: true,
    serviceId,
    count: orderedIds.length,
  });
}, { roles: ["owner", "head_office", "admin"] });
