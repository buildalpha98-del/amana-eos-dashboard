"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import {
  Search,
  ChevronDown,
  HelpCircle,
  BookOpen,
  Sparkles,
  Users,
  ShieldCheck,
  Wrench,
  MessageSquare,
  Database,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface Article {
  id: string;
  title: string;
  body: string;
  category: string;
  slug: string;
  sortOrder: number;
  videoUrl?: string | null;
}

const categories = [
  { key: "", label: "All", icon: BookOpen },
  { key: "getting_started", label: "Getting Started", icon: Sparkles },
  { key: "eos_basics", label: "EOS Basics", icon: HelpCircle },
  { key: "hr", label: "HR & Leave", icon: Users },
  { key: "compliance", label: "Compliance", icon: ShieldCheck },
  { key: "operations", label: "Operations", icon: Settings },
  { key: "troubleshooting", label: "Troubleshooting", icon: Wrench },
] as const;

export function HelpContent() {
  const { data: sessionData } = useSession();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const userRole = (sessionData?.user as { role?: string })?.role;
  const isAdmin = userRole === "owner" || userRole === "head_office";

  const { data, isLoading } = useQuery<{ articles: Article[] }>({
    queryKey: ["knowledge-base", activeCategory, searchTerm],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (activeCategory) params.set("category", activeCategory);
      if (searchTerm) params.set("search", searchTerm);
      const res = await fetch(`/api/knowledge-base?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to load articles");
      return res.json();
    },
  });

  const articles = data?.articles ?? [];

  const seedMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/knowledge-base/seed", { method: "POST" });
      if (!res.ok) throw new Error("Failed to seed articles");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["knowledge-base"] });
    },
  });

  // Group articles by category for display when showing "All"
  const groupedArticles = useMemo(() => {
    if (activeCategory) return { [activeCategory]: articles };
    const groups: Record<string, Article[]> = {};
    for (const article of articles) {
      if (!groups[article.category]) groups[article.category] = [];
      groups[article.category].push(article);
    }
    return groups;
  }, [articles, activeCategory]);

  const categoryLabel = (key: string) =>
    categories.find((c) => c.key === key)?.label ?? key;

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
          Help Centre
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Find answers to common questions
        </p>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search articles..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent bg-white"
          />
        </div>
      </div>

      {/* Category Pills */}
      <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-6">
        <div className="flex gap-2 w-fit">
          {categories.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.key}
                onClick={() => {
                  setActiveCategory(cat.key);
                  setExpandedId(null);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors whitespace-nowrap border",
                  activeCategory === cat.key
                    ? "bg-brand text-white border-brand"
                    : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50",
                )}
              >
                <Icon className="w-3.5 h-3.5" />
                {cat.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="bg-white rounded-xl border border-gray-200 p-4 animate-pulse"
            >
              <div className="h-4 bg-gray-200 rounded w-2/3" />
            </div>
          ))}
        </div>
      )}

      {/* Articles */}
      {!isLoading && articles.length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedArticles).map(([catKey, catArticles]) => (
            <div key={catKey}>
              {!activeCategory && (
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
                  {categoryLabel(catKey)}
                </h3>
              )}
              <div className="space-y-2">
                {catArticles.map((article) => (
                  <div
                    key={article.id}
                    className="bg-white rounded-xl border border-gray-200 overflow-hidden transition-shadow hover:shadow-sm"
                  >
                    <button
                      onClick={() => toggleExpand(article.id)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3.5 text-left"
                    >
                      <span className="text-sm font-medium text-gray-900">
                        {article.title}
                      </span>
                      <ChevronDown
                        className={cn(
                          "w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200",
                          expandedId === article.id && "rotate-180",
                        )}
                      />
                    </button>
                    <div
                      className={cn(
                        "overflow-hidden transition-all duration-200 ease-in-out",
                        expandedId === article.id
                          ? "max-h-96 opacity-100"
                          : "max-h-0 opacity-0",
                      )}
                    >
                      <div className="px-4 pb-4 pt-0">
                        <div className="border-t border-gray-100 pt-3">
                          {article.videoUrl && (
                            <div className="aspect-video rounded-lg overflow-hidden bg-gray-100 mb-4">
                              <iframe
                                src={article.videoUrl}
                                className="w-full h-full"
                                allowFullScreen
                                allow="autoplay; fullscreen"
                              />
                            </div>
                          )}
                          <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-line">
                            {article.body}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty State */}
      {!isLoading && articles.length === 0 && (
        <div className="text-center py-16">
          <HelpCircle className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            {searchTerm ? "No articles found" : "No articles yet"}
          </h3>
          <p className="text-sm text-gray-500 mb-4">
            {searchTerm
              ? "Try a different search term or browse by category."
              : "The knowledge base hasn't been set up yet."}
          </p>
          {isAdmin && !searchTerm && (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-medium rounded-lg hover:bg-brand-hover transition-colors disabled:opacity-50"
            >
              <Database className="w-4 h-4" />
              {seedMutation.isPending ? "Seeding..." : "Seed FAQ Articles"}
            </button>
          )}
        </div>
      )}

      {/* "Can't find what you need?" card */}
      {!isLoading && articles.length > 0 && (
        <div className="mt-8 bg-gray-50 rounded-xl border border-gray-200 p-5 text-center">
          <MessageSquare className="w-8 h-8 text-brand mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            Can&apos;t find what you need?
          </h3>
          <p className="text-sm text-gray-500 mb-3">
            Use the feedback button in the bottom-right corner to ask a question
            or report an issue.
          </p>
          <a
            href="/tickets"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
          >
            Open a support ticket
          </a>
        </div>
      )}
    </div>
  );
}
