"use client";

import { useState } from "react";
import {
  useResponseTemplates,
  useCreateResponseTemplate,
  useDeleteResponseTemplate,
} from "@/hooks/useResponseTemplates";
import { X, Plus, Trash2, FileText } from "lucide-react";

export function ResponseTemplateManager({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { data: templates = [], isLoading } = useResponseTemplates();
  const createTemplate = useCreateResponseTemplate();
  const deleteTemplate = useDeleteResponseTemplate();

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("");

  if (!open) return null;

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createTemplate.mutate(
      { title, body, category: category || null },
      {
        onSuccess: () => {
          setTitle("");
          setBody("");
          setCategory("");
          setShowForm(false);
        },
      }
    );
  };

  const categories = [...new Set(templates.map((t) => t.category).filter(Boolean))] as string[];

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-gray-400" />
            <h3 className="text-base font-semibold text-gray-900">
              Quick Reply Templates
            </h3>
            <span className="text-xs text-gray-400">{templates.length}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowForm(!showForm)}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-brand text-white rounded-md hover:bg-brand-hover"
            >
              <Plus className="w-3.5 h-3.5" />
              New Template
            </button>
            <button onClick={onClose} className="p-1 rounded-md text-gray-400 hover:text-gray-600">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Create Form */}
        {showForm && (
          <form onSubmit={handleCreate} className="px-6 py-4 border-b border-gray-100 bg-gray-50/50 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Title</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Greeting"
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">Category</label>
                <input
                  type="text"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  placeholder="e.g. General"
                  list="template-categories"
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand"
                />
                <datalist id="template-categories">
                  {categories.map((c) => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 block mb-1">Message Body</label>
              <textarea
                required
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="Hi {name}, thank you for reaching out..."
                className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-brand resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createTemplate.isPending}
                className="px-4 py-1.5 text-sm bg-brand text-white rounded-md hover:bg-brand-hover disabled:opacity-50"
              >
                {createTemplate.isPending ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        )}

        {/* Templates List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="py-12 text-center text-gray-400">Loading...</div>
          ) : templates.length === 0 ? (
            <div className="py-12 text-center">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No templates yet</p>
              <p className="text-xs text-gray-400">Create templates for faster replies</p>
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {templates.map((t) => (
                <div key={t.id} className="px-6 py-3 hover:bg-gray-50/50 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">{t.title}</span>
                        {t.category && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                            {t.category}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.body}</p>
                    </div>
                    <button
                      onClick={() => deleteTemplate.mutate(t.id)}
                      className="md:opacity-0 md:group-hover:opacity-100 opacity-60 p-1 text-muted/50 hover:text-danger transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
