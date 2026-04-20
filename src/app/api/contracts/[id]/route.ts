import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody } from "@/lib/api-error";
const updateContractSchema = z.object({
  contractType: z
    .enum(["ct_casual", "ct_part_time", "ct_permanent", "ct_fixed_term"])
    .optional(),
  awardLevel: z
    .enum([
      "es1", "es2", "es3", "es4",
      "cs1", "cs2", "cs3", "cs4",
      "director", "coordinator", "custom",
    ])
    .nullable()
    .optional(),
  awardLevelCustom: z.string().nullable().optional(),
  payRate: z.number().positive().optional(),
  hoursPerWeek: z.number().positive().nullable().optional(),
  startDate: z.string().optional(),
  endDate: z.string().nullable().optional(),
  status: z
    .enum(["contract_draft", "active", "superseded", "terminated"])
    .optional(),
  documentUrl: z.string().url().nullable().optional(),
  documentId: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

// GET /api/contracts/[id] — contract detail
export const GET = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const contract = await prisma.employmentContract.findUnique({
    where: { id },
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
      previousContract: {
        select: {
          id: true,
          contractType: true,
          payRate: true,
          startDate: true,
          endDate: true,
          status: true,
        },
      },
      supersededBy: {
        select: {
          id: true,
          contractType: true,
          payRate: true,
          startDate: true,
          status: true,
        },
      },
    },
  });

  if (!contract) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  // Staff can only view own contracts
  const isAdmin = ["owner", "admin"].includes(session!.user.role);
  if (!isAdmin && contract.userId !== session!.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(contract);
});

// PATCH /api/contracts/[id] — update contract (owner/admin only)
export const PATCH = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;

  const existing = await prisma.employmentContract.findUnique({
    where: { id },
  });

  if (!existing) {
    return NextResponse.json({ error: "Contract not found" }, { status: 404 });
  }

  const body = await parseJsonBody(req);
  const parsed = updateContractSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0].message },
      { status: 400 }
    );
  }

  const data: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value === undefined) continue;

    if (["startDate", "endDate"].includes(key)) {
      data[key] = value ? new Date(value as string) : null;
      continue;
    }

    data[key] = value;
  }

  const contract = await prisma.employmentContract.update({
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
      action: "update",
      entityType: "EmploymentContract",
      entityId: id,
      details: { fields: Object.keys(data) },
    },
  });

  return NextResponse.json(contract);
}, { roles: ["owner", "head_office", "admin"] });
