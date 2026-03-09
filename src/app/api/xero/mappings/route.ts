import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuth } from "@/lib/server-auth";
import { prisma } from "@/lib/prisma";

// ─── GET /api/xero/mappings ─────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { error } = await requireAuth(["owner", "head_office", "admin"]);
  if (error) return error;

  try {
    const [connection, services, accountMappings] = await Promise.all([
      prisma.xeroConnection.findUnique({
        where: { id: "singleton" },
        select: { trackingCategoryId: true },
      }),
      prisma.service.findMany({
        select: { id: true, name: true, code: true, xeroTrackingOptionId: true },
        orderBy: { name: "asc" },
      }),
      prisma.xeroAccountMapping.findMany({
        where: { xeroConnectionId: "singleton" },
        orderBy: { xeroAccountCode: "asc" },
      }),
    ]);

    return NextResponse.json({
      trackingCategoryId: connection?.trackingCategoryId ?? null,
      services,
      accountMappings,
    });
  } catch (err) {
    console.error("Failed to fetch Xero mappings:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch mappings" },
      { status: 500 }
    );
  }
}

// ─── POST /api/xero/mappings ────────────────────────────────────────────────

const saveMappingsSchema = z.object({
  trackingCategoryId: z.string().min(1),
  centreMappings: z.array(
    z.object({
      serviceId: z.string(),
      xeroTrackingOptionId: z.string(),
    })
  ),
  accountMappings: z.array(
    z.object({
      xeroAccountCode: z.string(),
      xeroAccountName: z.string(),
      xeroAccountType: z.string(),
      localCategory: z.enum([
        "bscRevenue",
        "ascRevenue",
        "vcRevenue",
        "otherRevenue",
        "staffCosts",
        "foodCosts",
        "suppliesCosts",
        "rentCosts",
        "adminCosts",
        "otherCosts",
      ]),
    })
  ),
});

export async function POST(req: NextRequest) {
  const { session, error } = await requireAuth(["owner"]);
  if (error) return error;

  const body = await req.json();
  const parsed = saveMappingsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { trackingCategoryId, centreMappings, accountMappings } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      // 1. Update XeroConnection trackingCategoryId
      await tx.xeroConnection.update({
        where: { id: "singleton" },
        data: { trackingCategoryId },
      });

      // 2. Reset all Service.xeroTrackingOptionId to null
      await tx.service.updateMany({
        data: { xeroTrackingOptionId: null },
      });

      // 3. Map each centre to its Xero tracking option
      for (const mapping of centreMappings) {
        await tx.service.update({
          where: { id: mapping.serviceId },
          data: { xeroTrackingOptionId: mapping.xeroTrackingOptionId },
        });
      }

      // 4. Delete all existing account mappings for the singleton connection
      await tx.xeroAccountMapping.deleteMany({
        where: { xeroConnectionId: "singleton" },
      });

      // 5. Create all new account mappings
      if (accountMappings.length > 0) {
        await tx.xeroAccountMapping.createMany({
          data: accountMappings.map((m) => ({
            xeroConnectionId: "singleton",
            xeroAccountCode: m.xeroAccountCode,
            xeroAccountName: m.xeroAccountName,
            xeroAccountType: m.xeroAccountType,
            localCategory: m.localCategory,
          })),
        });
      }
    });

    // Log the activity
    await prisma.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "update",
        entityType: "XeroMapping",
        entityId: "singleton",
        details: {
          trackingCategoryId,
          centreMappingsCount: centreMappings.length,
          accountMappingsCount: accountMappings.length,
        },
      },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Failed to save Xero mappings:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save mappings" },
      { status: 500 }
    );
  }
}
