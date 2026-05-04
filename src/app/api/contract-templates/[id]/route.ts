import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { manualFieldsSchema } from "@/lib/contract-templates/manual-fields-schema";

const tipTapDocSchema = z.object({
  type: z.literal("doc"),
  content: z.array(z.any()).optional(),
}).passthrough();

const updateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  contentJson: tipTapDocSchema.optional(),
  manualFields: manualFieldsSchema.optional(),
  status: z.enum(["active", "disabled"]).optional(),
});

export const GET = withApiAuth(
  async (_req, _session, context) => {
    const { id } = await (context?.params as Promise<{ id: string }>);
    const tpl = await prisma.contractTemplate.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
      },
    });
    if (!tpl) throw ApiError.notFound("Template not found");
    return NextResponse.json(tpl);
  },
  { roles: ["owner", "admin"], feature: "contracts.view" }
);

export const PATCH = withApiAuth(
  async (req, session, context) => {
    const { id } = await (context?.params as Promise<{ id: string }>);
    const body = await parseJsonBody(req);
    const parsed = updateSchema.safeParse(body);
    if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
    const data = parsed.data;

    const existing = await prisma.contractTemplate.findUnique({
      where: { id },
      select: { status: true },
    });
    if (!existing) throw ApiError.notFound("Template not found");

    // Determine activity action: status changes log as "disable"/"enable"; otherwise "update"
    let action: string = "update";
    if (data.status && data.status !== existing.status) {
      action = data.status === "disabled" ? "disable" : "enable";
    }

    const tpl = await prisma.$transaction(async (tx) => {
      const updated = await tx.contractTemplate.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.description !== undefined ? { description: data.description } : {}),
          ...(data.contentJson !== undefined ? { contentJson: data.contentJson as object } : {}),
          ...(data.manualFields !== undefined ? { manualFields: data.manualFields as object } : {}),
          ...(data.status !== undefined ? { status: data.status } : {}),
          updatedById: session!.user.id,
        },
      });
      await tx.activityLog.create({
        data: {
          userId: session!.user.id,
          action,
          entityType: "ContractTemplate",
          entityId: id,
          details: { changedFields: Object.keys(data) },
        },
      });
      return updated;
    });

    return NextResponse.json(tpl);
  },
  { roles: ["owner", "admin"], feature: "contracts.edit" }
);

export const DELETE = withApiAuth(
  async (_req, session, context) => {
    const { id } = await (context?.params as Promise<{ id: string }>);
    const tpl = await prisma.contractTemplate.findUnique({
      where: { id },
      select: { id: true, name: true },
    });
    if (!tpl) throw ApiError.notFound("Template not found");

    const referenceCount = await prisma.employmentContract.count({
      where: { templateId: id },
    });
    if (referenceCount > 0) {
      throw ApiError.conflict(
        `Template is referenced by ${referenceCount} issued contract(s); disable it instead`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.contractTemplate.delete({ where: { id } });
      await tx.activityLog.create({
        data: {
          userId: session!.user.id,
          action: "delete",
          entityType: "ContractTemplate",
          entityId: id,
          details: { name: tpl.name },
        },
      });
    });

    return NextResponse.json({ ok: true });
  },
  { roles: ["owner", "admin"], feature: "contracts.edit" }
);
