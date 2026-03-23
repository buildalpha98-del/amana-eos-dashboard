import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";

const reorderSchema = z.object({
  orderedIds: z.array(z.string().min(1)).min(1),
});

// PUT /api/measurables/reorder — update sort order for all measurables
export const PUT = withApiAuth(async (req) => {
  const body = await parseJsonBody(req);
  const parsed = reorderSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const { orderedIds } = parsed.data;

  // Update each measurable's sortOrder in a transaction
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.measurable.update({
        where: { id },
        data: { sortOrder: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
});
