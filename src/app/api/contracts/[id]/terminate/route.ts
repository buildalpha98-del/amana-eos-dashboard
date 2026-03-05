import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const terminateSchema = z.object({
  notes: z.string().optional(),
  endDate: z.string().optional(),
});

// POST /api/contracts/[id]/terminate — terminate a contract (owner/admin only)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const { id } = await params;

  const contract = await prisma.employmentContract.findUnique({
    where: { id },
  });

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  if (contract.status === "terminated") {
    return NextResponse.json(
      { error: "Contract is already terminated" },
      { status: 400 }
    );
  }

  if (contract.status === "superseded") {
    return NextResponse.json(
      { error: "Cannot terminate a superseded contract" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsed = terminateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {
    status: "terminated",
  };

  if (parsed.data.notes) {
    data.notes = parsed.data.notes;
  }

  if (parsed.data.endDate) {
    data.endDate = new Date(parsed.data.endDate);
  } else {
    data.endDate = new Date();
  }

  const updated = await prisma.employmentContract.update({
    where: { id },
    data,
    include: {
      user: {
        select: { id: true, name: true, email: true, avatar: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "terminate",
      entityType: "EmploymentContract",
      entityId: id,
      details: {
        contractType: contract.contractType,
        forUserId: contract.userId,
        notes: parsed.data.notes || null,
      },
    },
  });

  return NextResponse.json(updated);
}
