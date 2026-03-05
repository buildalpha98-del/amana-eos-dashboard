import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireAuth } from "@/lib/server-auth";

const createContractSchema = z.object({
  userId: z.string().min(1, "User ID is required"),
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
    .enum(["contract_draft", "active", "superseded", "terminated"])
    .default("contract_draft"),
  documentUrl: z.string().url().optional(),
  documentId: z.string().optional(),
  notes: z.string().optional(),
  previousContractId: z.string().optional(),
});

// GET /api/contracts — list contracts with filters
export async function GET(req: NextRequest) {
  const { session, error } = await requireAuth();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const userId = searchParams.get("userId");
  const status = searchParams.get("status");
  const serviceId = searchParams.get("serviceId");
  const isAdmin = ["owner", "admin"].includes(session!.user.role);

  const where: Record<string, unknown> = {};

  // Staff can only see their own contracts
  if (!isAdmin) {
    where.userId = session!.user.id;
  } else {
    if (userId) where.userId = userId;
  }

  if (status) where.status = status;

  // Filter by serviceId via user relation
  if (serviceId) {
    where.user = { serviceId };
  }

  const contracts = await prisma.employmentContract.findMany({
    where,
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          avatar: true,
          serviceId: true,
          service: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(contracts);
}

// POST /api/contracts — create contract (owner/admin only)
export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner", "admin"]);
  if (error) return error;

  const body = await req.json();
  const parsed = createContractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  // Verify user exists
  const user = await prisma.user.findUnique({
    where: { id: parsed.data.userId },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const contract = await prisma.employmentContract.create({
    data: {
      userId: parsed.data.userId,
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
      previousContractId: parsed.data.previousContractId || null,
    },
    include: {
      user: {
        select: { id: true, name: true, email: true, avatar: true },
      },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "EmploymentContract",
      entityId: contract.id,
      details: {
        contractType: contract.contractType,
        forUserId: contract.userId,
      },
    },
  });

  return NextResponse.json(contract, { status: 201 });
}
