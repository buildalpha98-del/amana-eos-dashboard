import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { withApiAuth } from "@/lib/server-auth";
import { ApiError, parseJsonBody } from "@/lib/api-error";
import { HELP_CENTRE_ADMIN_ROLES, uniqueHelpSlug } from "@/lib/help-centre";

const ADMIN = [...HELP_CENTRE_ADMIN_ROLES];

const patchSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(1000).optional(),
  icon: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional(),
  published: z.boolean().optional(),
});

// PATCH /api/help-centre/categories/[id]
export const PATCH = withApiAuth(
  async (req, _session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing category id");

    const parsed = patchSchema.safeParse(await parseJsonBody(req));
    if (!parsed.success) throw ApiError.badRequest("Validation failed", parsed.error.flatten());
    const data = parsed.data;

    const existing = await prisma.helpCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound("Category not found");

    const category = await prisma.helpCategory.update({
      where: { id },
      data: {
        ...(data.name !== undefined
          ? { name: data.name.trim(), slug: await uniqueHelpSlug("helpCategory", data.name, id) }
          : {}),
        ...(data.description !== undefined ? { description: data.description.trim() } : {}),
        ...(data.icon !== undefined ? { icon: data.icon.trim() || "book-open" } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
        ...(data.published !== undefined ? { published: data.published } : {}),
      },
    });
    return NextResponse.json({ category });
  },
  { roles: ADMIN },
);

// DELETE /api/help-centre/categories/[id] — cascades to its articles
export const DELETE = withApiAuth(
  async (_req, _session, context) => {
    const { id } = (await context?.params) ?? {};
    if (!id) throw ApiError.badRequest("Missing category id");

    const existing = await prisma.helpCategory.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw ApiError.notFound("Category not found");

    await prisma.helpCategory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  },
  { roles: ADMIN },
);
