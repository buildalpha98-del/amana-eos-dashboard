import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const supersedeSchema = z.object({
  contractType: z.enum(["ct_casual", "ct_part_time", "ct_permanent", "ct_fixed_term"]),
  awardLevel: z
    .enum([
      "es1", "es2", "es3", "es4",
      "cs1", "cs2", "cs3", "cs4",
      "director", "coordinator", "custom",
    ])
    .optional(),
  awardLevelCustom: z.string().optional(),
  payRate: z.number().positive("Pay rate must be positive"),
  hoursPerWeek: z.number().positive().optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional(),
  status: z
    .enum(["contract_draft", "active"])
    .default("active"),
  documentUrl: z.string().url().optional(),
  documentId: z.string().optional(),
  notes: z.string().optional(),
});

// POST /api/contracts/[id]/supersede — create new contract version
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { session, error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  const { id } = await params;

  const oldContract = await prisma.employmentContract.findUnique({
    where: { id },
  });

  if (!oldContract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  if (oldContract.status === "superseded" || oldContract.status === "terminated") {
    return NextResponse.json(
      { error: "Cannot supersede a contract that is already superseded or terminated" },
      { status: 400 }
    );
  }

  const body = await req.json();
  const parsed = supersedeSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Transaction: mark old as superseded, create new with link
  const newContract = await prisma.$transaction(async (tx) => {
    // Mark old contract as superseded
    await tx.employmentContract.update({
      where: { id },
      data: {
        status: "superseded",
        endDate: new Date(parsed.data.startDate),
      },
    });

    // Create new contract
    const created = await tx.employmentContract.create({
      data: {
        userId: oldContract.userId,
        contractType: parsed.data.contractType,
        awardLevel: parsed.data.awardLevel || null,
        awardLevelCustom: parsed.data.awardLevelCustom || null,
        payRate: parsed.data.payRate,
        hoursPerWeek: parsed.data.hoursPerWeek || null,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        status: parsed.data.status,
        documentUrl: parsed.data.documentUrl || null,
        documentId: parsed.data.documentId || null,
        notes: parsed.data.notes || null,
        previousContractId: id,
      },
      include: {
        user: {
          select: { id: true, name: true, email: true, avatar: true },
        },
        previousContract: {
          select: { id: true, contractType: true, payRate: true, status: true },
        },
      },
    });

    return created;
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "supersede",
      entityType: "EmploymentContract",
      entityId: newContract.id,
      details: {
        previousContractId: id,
        newContractType: newContract.contractType,
        newPayRate: newContract.payRate,
      },
    },
  });

  return NextResponse.json(newContract, { status: 201 });
}
