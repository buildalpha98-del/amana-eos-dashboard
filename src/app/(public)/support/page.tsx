import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { ChevronRight, LifeBuoy } from "lucide-react";
import { SearchBox } from "./SearchBox";
import { CategoryIcon } from "./CategoryIcon";

// Content is admin-editable — render per request so publishes appear
// immediately rather than freezing at build time.
export const dynamic = "force-dynamic";

function formatModified(date: Date): string {
  return `Updated ${date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}`;
}

export default async function SupportHomePage() {
  const [categories, popular] = await Promise.all([
    prisma.helpCategory.findMany({
      where: { published: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        slug: true,
        description: true,
        icon: true,
        _count: { select: { articles: { where: { published: true } } } },
      },
    }),
    prisma.helpArticle.findMany({
      where: { published: true, category: { is: { published: true } } },
      orderBy: [{ viewCount: "desc" }, { updatedAt: "desc" }],
      take: 6,
      select: { id: true, title: true, slug: true, updatedAt: true },
    }),
  ]);

  return (
    <main>
      {/* Hero */}
      <section className="bg-brand pb-16 pt-12 text-center">
        <div className="mx-auto max-w-3xl px-4">
          <h1 className="text-3xl font-semibold text-white md:text-4xl">
            Hi, how can we help?
          </h1>
          <p className="mt-2 text-white/80">
            Search our knowledge base, or browse answers about enrolments, bookings,
            payments and our programs.
          </p>
          <div className="mt-6">
            <SearchBox />
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="mx-auto w-full max-w-5xl px-4 py-12">
        <h2 className="text-xl font-semibold text-brand">Browse by topic</h2>
        {categories.length === 0 ? (
          <p className="mt-4 text-brand/70">
            Articles are on their way — in the meantime,{" "}
            <Link href="/support/tickets/new" className="font-medium underline">
              contact our team
            </Link>{" "}
            with any question.
          </p>
        ) : (
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            {categories.map((c) => (
              <Link
                key={c.id}
                href={`/support/categories/${c.slug}`}
                className="group rounded-2xl bg-card p-6 shadow-sm ring-1 ring-black/5 transition-transform hover:-translate-y-0.5"
              >
                <div className="flex items-start gap-4">
                  <span className="rounded-xl bg-accent-light p-3">
                    <CategoryIcon icon={c.icon} className="h-6 w-6 text-brand" />
                  </span>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-brand group-hover:underline">
                      {c.name}
                    </h3>
                    {c.description && (
                      <p className="mt-1 line-clamp-2 text-sm text-brand/70">{c.description}</p>
                    )}
                    <p className="mt-2 text-xs font-medium uppercase tracking-wide text-brand/50">
                      {c._count.articles} article{c._count.articles === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* Popular articles */}
      {popular.length > 0 && (
        <section className="mx-auto w-full max-w-5xl px-4 pb-12">
          <h2 className="text-xl font-semibold text-brand">Most popular articles</h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {popular.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/support/articles/${a.slug}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-card px-5 py-4 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-surface"
                >
                  <span>
                    <span className="block font-medium text-brand">{a.title}</span>
                    <span className="mt-0.5 block text-xs text-brand/60">
                      {formatModified(a.updatedAt)}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-brand/40" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Contact CTA */}
      <section className="mx-auto w-full max-w-5xl px-4 pb-16">
        <div className="flex flex-col items-start gap-4 rounded-2xl bg-brand p-8 text-white sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">Still need a hand?</h2>
            <p className="mt-1 text-white/80">
              Send our team a message and we&rsquo;ll get back to you as soon as we can.
            </p>
          </div>
          <Link
            href="/support/tickets/new"
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-5 py-2.5 font-semibold text-brand transition-colors hover:bg-accent-light"
          >
            <LifeBuoy className="h-4 w-4" aria-hidden />
            Submit a ticket
          </Link>
        </div>
      </section>
    </main>
  );
}
