import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import { prisma } from "@/lib/prisma";
import { runAfter } from "@/lib/run-after";
import { logger } from "@/lib/logger";
import { ChevronRight, LifeBuoy } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function SupportArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const article = await prisma.helpArticle.findFirst({
    where: { slug, published: true, category: { is: { published: true } } },
    select: {
      id: true,
      title: true,
      body: true,
      updatedAt: true,
      category: {
        select: {
          name: true,
          slug: true,
          articles: {
            where: { published: true, NOT: { slug } },
            orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
            take: 5,
            select: { id: true, title: true, slug: true },
          },
        },
      },
    },
  });
  if (!article) notFound();

  // Count the read after the response — popularity ranking costs the reader nothing.
  runAfter(async () => {
    await prisma.helpArticle
      .update({ where: { id: article.id }, data: { viewCount: { increment: 1 } } })
      .catch((err) => logger.warn("help-centre viewCount increment failed", { slug, err }));
  });

  const related = article.category.articles;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <nav className="text-sm text-brand/60" aria-label="Breadcrumb">
        <Link href="/support" className="hover:underline">
          Help Centre
        </Link>{" "}
        /{" "}
        <Link href={`/support/categories/${article.category.slug}`} className="hover:underline">
          {article.category.name}
        </Link>
      </nav>

      <article className="mt-6 rounded-2xl bg-card p-6 shadow-sm ring-1 ring-black/5 sm:p-10">
        <h1 className="text-3xl font-semibold text-brand">{article.title}</h1>
        <p className="mt-2 text-sm text-brand/50">
          Updated{" "}
          {article.updatedAt.toLocaleDateString("en-AU", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })}
        </p>
        {/* No typography plugin in this app — style the markdown explicitly. */}
        <div className="mt-6 space-y-4 leading-relaxed text-brand/90">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeSanitize]}
            components={{
              h1: (props) => <h2 className="mt-8 text-2xl font-semibold text-brand" {...props} />,
              h2: (props) => <h2 className="mt-8 text-xl font-semibold text-brand" {...props} />,
              h3: (props) => <h3 className="mt-6 text-lg font-semibold text-brand" {...props} />,
              a: (props) => (
                <a className="font-medium text-brand-light underline underline-offset-2" {...props} />
              ),
              ul: (props) => <ul className="list-disc space-y-1.5 pl-6" {...props} />,
              ol: (props) => <ol className="list-decimal space-y-1.5 pl-6" {...props} />,
              blockquote: (props) => (
                <blockquote
                  className="border-l-4 border-accent bg-parent-bg px-4 py-2 italic"
                  {...props}
                />
              ),
              table: (props) => (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm" {...props} />
                </div>
              ),
              th: (props) => (
                <th className="border border-black/10 bg-accent-light px-3 py-2 text-left font-semibold text-brand" {...props} />
              ),
              td: (props) => <td className="border border-black/10 px-3 py-2" {...props} />,
              code: (props) => (
                <code className="rounded bg-black/5 px-1.5 py-0.5 text-[0.9em]" {...props} />
              ),
            }}
          >
            {article.body}
          </ReactMarkdown>
        </div>
      </article>

      {related.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold text-brand">
            More in {article.category.name}
          </h2>
          <ul className="mt-3 space-y-2">
            {related.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/support/articles/${a.slug}`}
                  className="flex items-center justify-between gap-3 rounded-xl bg-card px-5 py-3 shadow-sm ring-1 ring-black/5 transition-colors hover:bg-surface"
                >
                  <span className="text-sm font-medium text-brand">{a.title}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-brand/40" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex flex-col items-start gap-3 rounded-2xl bg-brand p-6 text-white sm:flex-row sm:items-center sm:justify-between">
        <p className="font-medium">Did this answer your question?</p>
        <Link
          href="/support/tickets/new"
          className="inline-flex shrink-0 items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-semibold text-brand transition-colors hover:bg-accent-light"
        >
          <LifeBuoy className="h-4 w-4" aria-hidden />
          I still need help
        </Link>
      </div>
    </main>
  );
}
