import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError } from "@/lib/api-error";

export const POST = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context?.params as Promise<{ id: string }>);

    const source = await prisma.contractTemplate.findUnique({
      where: { id },
    });
    if (!source) throw ApiError.notFound("Template not found");

    const cloned = await prisma.$transaction(async (tx) => {
      const created = await tx.contractTemplate.create({
        data: {
          name: `${source.name} (copy)`,
          description: source.description,
          contentJson: source.contentJson as object,
          manualFields: source.manualFields as object,
          status: "active",
          createdById: session!.user.id,
        },
      });
      await tx.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "clone",
          entityType: "ContractTemplate",
          entityId: created.id,
          details: { sourceId: source.id, sourceName: source.name },
        },
      });
      return created;
    });

    return NextResponse.json(cloned, { status: 201 });
  },
  { roles: ["owner", "admin"], feature: "contracts.create" }
);
