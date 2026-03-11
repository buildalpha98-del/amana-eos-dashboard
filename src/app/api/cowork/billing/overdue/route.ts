import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateApiKey } from "@/lib/api-key-auth";
import { checkApiKeyRateLimit } from "@/lib/rate-limit";

/**
 * GET /api/cowork/billing/overdue
 * Cowork API — returns overdue fee summary and records
 * Scope: billing:read
 *
 * Query params:
 *   - serviceId (optional)
 *   - agingBucket (optional)
 *   - status: "outstanding" | "all" (default "outstanding")
 */
export async function GET(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(req, "billing:read");
  if (authError) return authError;
  const { limited, resetIn } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json({ error: "Rate limit exceeded", resetIn }, { status: 429 });
  }

  const { searchParams } = new URL(req.url);
  const serviceId = searchParams.get("serviceId");
  const agingBucket = searchParams.get("agingBucket");
  const status = searchParams.get("status") || "outstanding";

  try {
    const where: Record<string, unknown> = { deleted: false };
    if (serviceId) where.serviceId = serviceId;
    if (agingBucket) where.agingBucket = agingBucket;
    if (status === "outstanding") {
      where.reminderStatus = { not: "resolved" };
    }

    const records = await prisma.overdueFeeRecord.findMany({
      where,
      include: {
        service: { select: { id: true, name: true, code: true } },
      },
      orderBy: [{ daysOverdue: "desc" }, { balance: "desc" }],
    });

    const totalOverdue = records.reduce((sum, r) => sum + r.balance, 0);
    const familyCount = new Set(records.map((r) => r.parentName)).size;

    // Per-service breakdown
    const byService: Record<string, { serviceName: string; count: number; total: number }> = {};
    for (const r of records) {
      const key = r.serviceId;
      if (!byService[key]) {
        byService[key] = { serviceName: r.service.name, count: 0, total: 0 };
      }
      byService[key].count++;
      byService[key].total += r.balance;
    }

    const agingBreakdown = {
      current: records.filter((r) => r.agingBucket === "current").reduce((s, r) => s + r.balance, 0),
      "7d": records.filter((r) => r.agingBucket === "7d").reduce((s, r) => s + r.balance, 0),
      "14d": records.filter((r) => r.agingBucket === "14d").reduce((s, r) => s + r.balance, 0),
      "30d": records.filter((r) => r.agingBucket === "30d").reduce((s, r) => s + r.balance, 0),
      "45d": records.filter((r) => r.agingBucket === "45d").reduce((s, r) => s + r.balance, 0),
      "60plus": records.filter((r) => r.agingBucket === "60plus").reduce((s, r) => s + r.balance, 0),
    };

    return NextResponse.json({
      records,
      count: records.length,
      summary: {
        totalOverdue,
        familyCount,
        agingBreakdown,
        byService: Object.values(byService),
      },
    });
  } catch (err) {
    console.error("[Cowork Billing Overdue GET]", err);
    return NextResponse.json({ error: "Failed to fetch overdue data" }, { status: 500 });
  }
}

/**
 * POST /api/cowork/billing/overdue
 * Cowork API — push reminder draft messages as Todo items
 * Scope: billing:write
 */
export async function POST(req: NextRequest) {
  const { apiKey, error: authError } = await authenticateApiKey(req, "billing:write");
  if (authError) return authError;
  const { limited, resetIn } = await checkApiKeyRateLimit(apiKey!.id);
  if (limited) {
    return NextResponse.json({ error: "Rate limit exceeded", resetIn }, { status: 429 });
  }

  try {
    const body = await req.json();
    const { recordId, message, assigneeId } = body;

    if (!recordId || !message) {
      return NextResponse.json(
        { error: "recordId and message are required" },
        { status: 400 },
      );
    }

    const record = await prisma.overdueFeeRecord.findUnique({
      where: { id: recordId },
      include: { service: { select: { name: true } } },
    });
    if (!record || record.deleted) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    // Create a Todo as a reminder draft
    const dueDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    const weekOf = new Date(dueDate);
    weekOf.setDate(weekOf.getDate() - weekOf.getDay()); // start of week
    const todo = await prisma.todo.create({
      data: {
        title: `Fee Reminder: ${record.parentName} — $${record.balance.toFixed(2)} overdue (${record.agingBucket})`,
        description: message,
        assigneeId: assigneeId || record.assigneeId,
        dueDate,
        weekOf,
      },
    });

    return NextResponse.json({ success: true, todoId: todo.id }, { status: 201 });
  } catch (err) {
    console.error("[Cowork Billing Overdue POST]", err);
    return NextResponse.json({ error: "Failed to create reminder draft" }, { status: 500 });
  }
}
