"use client";

import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";
import {
  BookOpen,
  ExternalLink,
  Eye,
  FilePlus2,
  FolderPlus,
  Pencil,
  Trash2,
} from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/Dialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils";
import { CategoryIcon, CATEGORY_ICON_KEYS } from "@/app/(public)/support/CategoryIcon";
import {
  useHelpCategories,
  useHelpArticles,
  useCreateHelpCategory,
  useUpdateHelpCategory,
  useDeleteHelpCategory,
  useCreateHelpArticle,
  useUpdateHelpArticle,
  useDeleteHelpArticle,
  type HelpCategoryRow,
  type HelpArticleRow,
} from "@/hooks/useHelpCentre";

const fieldClass =
  "w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground outline-none focus:border-brand focus:ring-2 focus:ring-brand/20";

// ─── Category create/edit dialog ─────────────────────────────

function CategoryDialog({
  open,
  onOpenChange,
  category,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: HelpCategoryRow | null;
}) {
  const [name, setName] = useState(category?.name ?? "");
  const [description, setDescription] = useState(category?.description ?? "");
  const [icon, setIcon] = useState(category?.icon ?? "book-open");
  const [sortOrder, setSortOrder] = useState(category?.sortOrder ?? 0);
  const [published, setPublished] = useState(category?.published ?? false);

  const create = useCreateHelpCategory();
  const update = useUpdateHelpCategory();
  const pending = create.isPending || update.isPending;

  const save = () => {
    const body = { name, description, icon, sortOrder, published };
    const onSuccess = () => onOpenChange(false);
    if (category) update.mutate({ id: category.id, ...body }, { onSuccess });
    else create.mutate(body, { onSuccess });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogTitle className="text-lg font-semibold text-foreground">
          {category ? "Edit category" : "New category"}
        </DialogTitle>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Name *</span>
            <input
              className={fieldClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              maxLength={120}
              placeholder="e.g. Enrolments & Bookings"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Description</span>
            <textarea
              className={cn(fieldClass, "min-h-20 resize-y")}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={1000}
              placeholder="Shown on the category card on the public help centre"
            />
          </label>
          <div className="grid grid-cols-2 gap-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Icon</span>
              <select className={fieldClass} value={icon} onChange={(e) => setIcon(e.target.value)}>
                {CATEGORY_ICON_KEYS.map((k) => (
                  <option key={k} value={k}>
                    {k}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Sort order</span>
              <input
                className={fieldClass}
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm text-foreground">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
              className="h-4 w-4 rounded border-border accent-[var(--color-brand)]"
            />
            Published (visible on the public help centre)
          </label>
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={pending} disabled={!name.trim()}>
              {category ? "Save changes" : "Create category"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Article create/edit dialog ──────────────────────────────

function ArticleDialog({
  open,
  onOpenChange,
  article,
  categories,
  defaultCategoryId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  article: HelpArticleRow | null;
  categories: HelpCategoryRow[];
  defaultCategoryId: string | null;
}) {
  const [categoryId, setCategoryId] = useState(
    article?.categoryId ?? defaultCategoryId ?? categories[0]?.id ?? "",
  );
  const [title, setTitle] = useState(article?.title ?? "");
  const [body, setBody] = useState(article?.body ?? "");
  const [sortOrder, setSortOrder] = useState(article?.sortOrder ?? 0);
  const [published, setPublished] = useState(article?.published ?? false);
  const [tab, setTab] = useState<"write" | "preview">("write");

  const create = useCreateHelpArticle();
  const update = useUpdateHelpArticle();
  const pending = create.isPending || update.isPending;

  const save = () => {
    const onSuccess = () => onOpenChange(false);
    if (article) {
      update.mutate({ id: article.id, categoryId, title, body, sortOrder, published }, { onSuccess });
    } else {
      create.mutate({ categoryId, title, body, sortOrder, published }, { onSuccess });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="full">
        <DialogTitle className="text-lg font-semibold text-foreground">
          {article ? "Edit article" : "New article"}
        </DialogTitle>
        <form
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_auto]">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Category *</span>
              <select
                className={fieldClass}
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-foreground">Sort order</span>
              <input
                className={cn(fieldClass, "w-24")}
                type="number"
                min={0}
                max={9999}
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </label>
            <label className="flex items-end gap-2 pb-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={published}
                onChange={(e) => setPublished(e.target.checked)}
                className="h-4 w-4 rounded border-border accent-[var(--color-brand)]"
              />
              Published
            </label>
          </div>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-foreground">Title *</span>
            <input
              className={fieldClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              maxLength={200}
              placeholder="e.g. How do I book a casual day?"
            />
          </label>

          <div>
            <div className="mb-2 flex items-center gap-1 rounded-lg bg-surface p-1 w-fit">
              {(["write", "preview"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "rounded-md px-3 py-1 text-sm font-medium capitalize transition-colors",
                    tab === t ? "bg-card text-foreground shadow-sm" : "text-muted hover:text-foreground",
                  )}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === "write" ? (
              <textarea
                className={cn(fieldClass, "min-h-72 resize-y font-mono text-xs leading-relaxed")}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                required
                placeholder={"Markdown supported — headings, lists, links, tables.\n\n## Example heading\n\n1. Step one\n2. Step two"}
              />
            ) : (
              <div className="min-h-72 space-y-3 rounded-lg border border-border bg-card px-4 py-3 text-sm leading-relaxed text-foreground">
                {body.trim() ? (
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeSanitize]}
                    components={{
                      h1: (props) => <h2 className="mt-4 text-lg font-semibold" {...props} />,
                      h2: (props) => <h2 className="mt-4 text-lg font-semibold" {...props} />,
                      h3: (props) => <h3 className="mt-3 text-base font-semibold" {...props} />,
                      a: (props) => <a className="text-brand underline" {...props} />,
                      ul: (props) => <ul className="list-disc space-y-1 pl-5" {...props} />,
                      ol: (props) => <ol className="list-decimal space-y-1 pl-5" {...props} />,
                    }}
                  >
                    {body}
                  </ReactMarkdown>
                ) : (
                  <p className="text-muted">Nothing to preview yet.</p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={pending}
              disabled={!title.trim() || !body.trim() || !categoryId}
            >
              {article ? "Save changes" : "Create article"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page content ────────────────────────────────────────────

export function HelpCentreContent() {
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [categoryDialog, setCategoryDialog] = useState<{
    open: boolean;
    category: HelpCategoryRow | null;
  }>({ open: false, category: null });
  const [articleDialog, setArticleDialog] = useState<{
    open: boolean;
    article: HelpArticleRow | null;
  }>({ open: false, article: null });
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "category"; row: HelpCategoryRow }
    | { kind: "article"; row: HelpArticleRow }
    | null
  >(null);

  const categoriesQuery = useHelpCategories();
  const articlesQuery = useHelpArticles(selectedCategoryId ?? undefined);
  const deleteCategory = useDeleteHelpCategory();
  const deleteArticle = useDeleteHelpArticle();

  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data]);
  const articles = articlesQuery.data ?? [];
  const selectedCategory = categories.find((c) => c.id === selectedCategoryId) ?? null;

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const onSuccess = () => {
      if (deleteTarget.kind === "category" && deleteTarget.row.id === selectedCategoryId) {
        setSelectedCategoryId(null);
      }
      setDeleteTarget(null);
    };
    if (deleteTarget.kind === "category") deleteCategory.mutate(deleteTarget.row.id, { onSuccess });
    else deleteArticle.mutate(deleteTarget.row.id, { onSuccess });
  };

  return (
    <div>
      <PageHeader
        title="Help Centre"
        description="Content for the public parent help centre at /support — categories, articles and the contact-form queue."
        primaryAction={{
          label: "New article",
          icon: FilePlus2,
          onClick: () => setArticleDialog({ open: true, article: null }),
        }}
        secondaryActions={[
          {
            label: "New category",
            icon: FolderPlus,
            onClick: () => setCategoryDialog({ open: true, category: null }),
            variant: "secondary",
          },
          {
            label: "View public site",
            icon: ExternalLink,
            onClick: () => window.open("/support", "_blank", "noopener"),
            variant: "secondary",
          },
        ]}
      />

      {categoriesQuery.isLoading ? (
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : categories.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="No categories yet"
          description="Create your first category — e.g. Enrolments & Bookings — then add articles to it."
          action={{
            label: "New category",
            icon: FolderPlus,
            onClick: () => setCategoryDialog({ open: true, category: null }),
          }}
        />
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[280px_1fr]">
          {/* Category rail */}
          <div className="rounded-xl border border-border bg-card p-2">
            <button
              onClick={() => setSelectedCategoryId(null)}
              className={cn(
                "w-full rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                selectedCategoryId === null
                  ? "bg-brand/10 text-brand"
                  : "text-foreground hover:bg-surface",
              )}
            >
              All articles
            </button>
            {categories.map((c) => (
              <div
                key={c.id}
                className={cn(
                  "group flex items-center gap-2 rounded-lg px-3 py-2 transition-colors",
                  selectedCategoryId === c.id ? "bg-brand/10" : "hover:bg-surface",
                )}
              >
                <button
                  onClick={() => setSelectedCategoryId(c.id)}
                  className="flex min-w-0 flex-1 items-center gap-2 text-left"
                >
                  <CategoryIcon icon={c.icon} className="h-4 w-4 shrink-0 text-brand/70" />
                  <span
                    className={cn(
                      "truncate text-sm",
                      selectedCategoryId === c.id ? "font-medium text-brand" : "text-foreground",
                    )}
                  >
                    {c.name}
                  </span>
                  {!c.published && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-2xs font-semibold uppercase text-amber-700">
                      Draft
                    </span>
                  )}
                  <span className="ml-auto shrink-0 text-xs text-muted">{c.articleCount}</span>
                </button>
                <button
                  onClick={() => setCategoryDialog({ open: true, category: c })}
                  className="hidden shrink-0 rounded p-1 text-muted hover:bg-card hover:text-foreground group-hover:block"
                  aria-label={`Edit ${c.name}`}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setDeleteTarget({ kind: "category", row: c })}
                  className="hidden shrink-0 rounded p-1 text-muted hover:bg-card hover:text-red-600 group-hover:block"
                  aria-label={`Delete ${c.name}`}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>

          {/* Articles */}
          <div className="rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="font-medium text-foreground">
                {selectedCategory ? selectedCategory.name : "All articles"}
                <span className="ml-2 text-sm font-normal text-muted">{articles.length}</span>
              </h3>
            </div>
            {articlesQuery.isLoading ? (
              <div className="space-y-2 p-4">
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
                <Skeleton className="h-10 rounded-lg" />
              </div>
            ) : articles.length === 0 ? (
              <div className="p-6">
                <EmptyState
                  icon={BookOpen}
                  variant="inline"
                  title="No articles here yet"
                  description="Write the first article for this topic."
                  action={{
                    label: "New article",
                    icon: FilePlus2,
                    onClick: () => setArticleDialog({ open: true, article: null }),
                  }}
                />
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {articles.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-foreground">{a.title}</p>
                      <p className="mt-0.5 flex items-center gap-3 text-xs text-muted">
                        <span>{a.category.name}</span>
                        <span className="inline-flex items-center gap-1">
                          <Eye className="h-3 w-3" aria-hidden />
                          {a.viewCount}
                        </span>
                        <span>
                          Updated{" "}
                          {new Date(a.updatedAt).toLocaleDateString("en-AU", {
                            day: "numeric",
                            month: "short",
                          })}
                        </span>
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full px-2 py-0.5 text-2xs font-semibold uppercase",
                        a.published ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700",
                      )}
                    >
                      {a.published ? "Published" : "Draft"}
                    </span>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setArticleDialog({ open: true, article: a })}
                      aria-label={`Edit ${a.title}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="xs"
                      onClick={() => setDeleteTarget({ kind: "article", row: a })}
                      aria-label={`Delete ${a.title}`}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-red-600" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {categoryDialog.open && (
        <CategoryDialog
          key={categoryDialog.category?.id ?? "new"}
          open={categoryDialog.open}
          onOpenChange={(open) => setCategoryDialog((s) => ({ ...s, open }))}
          category={categoryDialog.category}
        />
      )}
      {articleDialog.open && (
        <ArticleDialog
          key={articleDialog.article?.id ?? "new"}
          open={articleDialog.open}
          onOpenChange={(open) => setArticleDialog((s) => ({ ...s, open }))}
          article={articleDialog.article}
          categories={categories}
          defaultCategoryId={selectedCategoryId}
        />
      )}
      <ConfirmDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.kind === "category" ? "Delete category?" : "Delete article?"}
        description={
          deleteTarget?.kind === "category"
            ? `"${deleteTarget.row.name}" and all ${deleteTarget.row.articleCount} of its articles will be removed from the public help centre. This cannot be undone.`
            : deleteTarget
              ? `"${deleteTarget.row.title}" will be removed from the public help centre. This cannot be undone.`
              : ""
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        loading={deleteCategory.isPending || deleteArticle.isPending}
      />
    </div>
  );
}
