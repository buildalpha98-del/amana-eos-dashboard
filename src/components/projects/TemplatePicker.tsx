"use client";

import { useMemo } from "react";
import { useProjectTemplates, type ProjectTemplate } from "@/hooks/useProjectTemplates";
import { X, Rocket, FileText, ChevronRight, Loader2 } from "lucide-react";

export function TemplatePicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (templateId: string) => void;
}) {
  const { data: templates, isLoading } = useProjectTemplates();

  // Sort: "Centre Launch" featured first
  const sorted = useMemo(() => {
    if (!templates) return [];
    return [...templates].sort((a, b) => {
      const aFeatured = a.name.toLowerCase().includes("launch") ? -1 : 0;
      const bFeatured = b.name.toLowerCase().includes("launch") ? -1 : 0;
      if (aFeatured !== bFeatured) return aFeatured - bFeatured;
      return a.name.localeCompare(b.name);
    });
  }, [templates]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-4 p-6 max-h-[80vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              Launch from Template
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              Choose a template to start your project
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 text-brand animate-spin" />
          </div>
        ) : sorted.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-10 h-10 text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              No templates available. Create a template first.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sorted.map((t) => {
              const isFeatured = t.name.toLowerCase().includes("launch");
              const categories = getCategories(t);
              const maxDays = Math.max(
                ...t.tasks.map((task) => task.defaultDays || 0)
              );

              return (
                <button
                  key={t.id}
                  onClick={() => onSelect(t.id)}
                  className={`w-full flex items-start gap-3 p-4 rounded-xl border-2 text-left transition-all group ${
                    isFeatured
                      ? "border-brand/30 bg-brand/[0.02] hover:border-brand hover:bg-brand/5"
                      : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                  }`}
                >
                  {isFeatured ? (
                    <div className="w-10 h-10 rounded-lg bg-brand/10 flex items-center justify-center flex-shrink-0">
                      <Rocket className="w-5 h-5 text-brand" />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0">
                      <FileText className="w-5 h-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-gray-900">
                        {t.name}
                      </p>
                      {isFeatured && (
                        <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-brand text-white">
                          FEATURED
                        </span>
                      )}
                    </div>
                    {t.description && (
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                        {t.description}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] font-medium text-gray-400">
                        {t.tasks.length} tasks
                      </span>
                      {maxDays > 0 && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span className="text-[10px] font-medium text-gray-400">
                            {maxDays} days
                          </span>
                        </>
                      )}
                      {categories.length > 0 && (
                        <>
                          <span className="text-gray-300">|</span>
                          <span className="text-[10px] font-medium text-gray-400">
                            {categories.length} phases
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-500 mt-1 flex-shrink-0 transition-colors" />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function getCategories(t: ProjectTemplate): string[] {
  const set = new Set<string>();
  for (const task of t.tasks) {
    if (task.category) set.add(task.category);
  }
  return Array.from(set);
}
