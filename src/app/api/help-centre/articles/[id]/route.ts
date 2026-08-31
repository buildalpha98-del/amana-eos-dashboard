import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { HELP_CENTRE_ADMIN_ROLES, uniqueHelpSlug } from "@/lib/help-centre";

const ADMIN = [...HELP_CENTRE_ADMIN_ROLES];

const patchSchema = z.object({
  categoryId: z.string().min(1).optional(),
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(100_000).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  published: z.boolean().optional(),
});

// PATCH /api/help-centre/articles/[id]
export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing article id");

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
    const data = parsed.data;

    const existing = await prisma.helpArticle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound("Article not found");

    if (data.categoryId) {
      const category = await prisma.helpCategory.findUnique({
        where: { id: data.categoryId },
        select: { id: true },
      });
      if (!category) throw ApiError.badRequest("Unknown category");
    }

    const article = await prisma.helpArticle.update({
      where: { id },
      data: {
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.title !== undefined
          ? { title: data.title.trim(), slug: await uniqueHelpSlug("helpArticle", data.title, id) }
          : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.published !== undefined ? { published: data.published } : {}),
      },
    });
    return NextResponse.json({ article });
  },
  { roles: ADMIN },
);

// DELETE /api/help-centre/articles/[id]
export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing article id");

    const existing = await prisma.helpArticle.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound("Article not found");

    await prisma.helpArticle.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
  { roles: ADMIN },
);
