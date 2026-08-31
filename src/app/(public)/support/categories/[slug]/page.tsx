import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { ChevronRight } from "lucide-react";
import { CategoryIcon } from "../../CategoryIcon";

export const dynamic = "force-dynamic";

export default async function SupportCategoryPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await prisma.helpCategory.findFirst({
    where: { slug, published: true },
    select: {
      name: true,
      description: true,
      icon: true,
      articles: {
        where: { published: true },
        orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
        select: { id: true, title: true, slug: true, updatedAt: true },
      },
    },
  });
  if (!category) notFound();

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <nav className="text-sm text-brand/60" aria-label="Breadcrumb">
        <Link href="/support" className="hover:underline">
          Help Centre
        </Link>{" "}
        / <span className="text-brand/80">{category.name}</span>
      </nav>

      <div className="mt-6 flex items-start gap-4">
        <span className="rounded-xl bg-accent-light p-3">
          <CategoryIcon icon={category.icon} className="h-7 w-7 text-brand" />
        </span>
        <div>
          <h1 className="text-3xl font-semibold text-brand">{category.name}</h1>
          {category.description && <p className="mt-2 text-brand/70">{category.description}</p>}
        </div>
      </div>

      {category.articles.length === 0 ? (
        <p className="mt-8 rounded-2xl bg-card p-6 text-brand/70 shadow-sm ring-1 ring-black/5">
          No articles in this topic yet — check back soon, or{" "}
          <Link href="/support/tickets/new" className="font-medium underline">
            ask our team directly
          </Link>
          .
        </p>
      ) : (
        <ul className="mt-8 space-y-3">
          {category.articles.map((a) => (
            <li key={a.id}>
              <Link
                href={`/support/articles/${a.slug}`}
                className="flex items-center justify-between gap-3 rounded-xl bg-card px-5 py-4 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-surface"
              >
                <span className="font-medium text-brand">{a.title}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-brand/40" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
