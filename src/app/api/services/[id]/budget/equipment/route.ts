import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { recalcFinancialsForWeek } from "@/lib/budget-helpers";
import { withApiAuth } from "@/lib/server-auth";
import { ensureCoordOwnService } from "../route";

import { parseJsonBody } from "@/lib/api-error";
const equipmentItemSchema = z
  .object({
    name: z.string().min(1).max(200),
    amount: z.number().positive(),
    category: z.enum([
      "groceries", "kitchen", "sports", "art_craft", "furniture",
      "technology", "cleaning", "safety", "other",
    ]),
    date: z.string(),
    notes: z.string().max(500).optional(),
  })
  .refine(
    (data) =>
      data.category !== "other" ||
      (typeof data.notes === "string" && data.notes.trim().length > 0),
    {
      message:
        "Please describe what this item is — the Other category needs a description for later reporting.",
      path: ["notes"],
    }
  );

export { equipmentItemSchema };

// GET /api/services/[id]/budget/equipment — list equipment items
export const GET = withApiAuth(async (req, session, context) => {
  const { id } = await context!.params!;
  ensureCoordOwnService(
    session.user.role ?? "",
    (session.user as { serviceId?: string | null }).serviceId,
    id,
  );
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  const category = url.searchParams.get("category");

  const where: Record<string, unknown> = { serviceId: id };
  if (from || to) {
    where.date = {};
    if (from) (where.date as Record<string, unknown>).gte = new Date(from);
    if (to) (where.date as Record<string, unknown>).lte = new Date(to);
  }
  if (category) where.category = category;

  const items = await prisma.budgetItem.findMany({
    where,
    include: {
      createdBy: { select: { id: true, name: true } },
    },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(items);
}, { roles: ["owner", "head_office", "admin", "member"] });

// POST /api/services/[id]/budget/equipment — create equipment item
export const POST = withApiAuth(async (req, session, context) => {
const { id } = await context!.params!;
  ensureCoordOwnService(
    session.user.role ?? "",
    (session.user as { serviceId?: string | null }).serviceId,
    id,
  );
  const body = await parseJsonBody(req);
  const parsed = equipmentItemSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;

  // Verify service exists
  const service = await prisma.service.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const item = await prisma.budgetItem.create({
    data: {
      serviceId: id,
      name: data.name,
      amount: data.amount,
      category: data.category,
      date: new Date(data.date),
      notes: data.notes || null,
      createdById: session!.user.id,
    },
    include: {
      createdBy: { select: { id: true, name: true } },
    },
  });

  await prisma.activityLog.create({
    data: {
      userId: session!.user.id,
      action: "create",
      entityType: "BudgetItem",
      entityId: item.id,
      details: { serviceId: id, name: data.name, amount: data.amount, category: data.category },
    },
  });

  // Sync to financials
  await recalcFinancialsForWeek(id, new Date(data.date));

  return NextResponse.json(item, { status: 201 });
}, { roles: ["owner", "head_office", "admin", "member"] });
