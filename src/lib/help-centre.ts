import { prisma } from "@/lib/prisma";

/** Roles allowed to manage help-centre content (mirrors the admin surfaces). */
export const HELP_CENTRE_ADMIN_ROLES = ["owner", "head_office", "admin"] as const;

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Derive a unique slug for a help category or article. Appends -2, -3, …
 * when the base slug is taken (excluding the row being updated).
 */
export async function uniqueHelpSlug(
  model: "helpCategory" | "helpArticle",
  title: string,
  excludeId?: string,
): Promise<string> {
  const base = slugify(title) || "untitled";
  for (let i = 1; i < 50; i++) {
    const candidate = i === 1 ? base : `${base}-${i}`;
    const existing =
      model === "helpCategory"
        ? await prisma.helpCategory.findUnique({ where: { slug: candidate }, select: { id: true } })
        : await prisma.helpArticle.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
