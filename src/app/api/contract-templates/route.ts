import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { parseJsonBody, ApiError } from "@/lib/api-error";
import { manualFieldsSchema } from "@/lib/contract-templates/manual-fields-schema";
import { tipTapDocSchema } from "@/lib/contract-templates/tiptap-doc-schema";

const listQuerySchema = z.object({
  status: z.enum(["active", "disabled"]).optional(),
  search: z.string().optional(),
});

const createSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  contentJson: tipTapDocSchema,
  manualFields: manualFieldsSchema,
});

export const GET = withApiAuth(async (req) => {
  const url = new URL(req.url);
  const parsed = listQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);

  const { status, search } = parsed.data;
  const templates = await prisma.contractTemplate.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(search ? { name: { contains: search, mode: "insensitive" as const } } : {}),
    },
    include: {
      createdBy: { select: { id: true, name: true } },
      updatedBy: { select: { id: true, name: true } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(templates);
}, { roles: ["owner", "admin"], feature: "contracts.view" });

export const POST = withApiAuth(async (req, session) => {
  const body = await parseJsonBody(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.issues[0].message);
  const data = parsed.data;

  const tpl = await prisma.$transaction(async (tx) => {
    const created = await tx.contractTemplate.create({
      data: {
        name: data.name,
        description: data.description,
        contentJson: data.contentJson as object,
        manualFields: data.manualFields as object,
        createdById: session!.user.id,
      },
    });
    await tx.activityLog.create({
      data: {
        userId: session!.user.id,
        action: "create",
        entityType: "ContractTemplate",
        entityId: created.id,
        details: { name: created.name },
      },
    });
    return created;
  });

  return NextResponse.json(tpl, { status: 201 });
}, { roles: ["owner", "admin"], feature: "contracts.create" });
