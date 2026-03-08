"use client";

import { useState, useMemo } from "react";
import { useCreateProject } from "@/hooks/useProjects";
import { useProjectTemplates, type ProjectTemplate } from "@/hooks/useProjectTemplates";
import { useServices } from "@/hooks/useServices";
import { useQuery } from "@tanstack/react-query";
import { X, FileText, Rocket, ChevronDown, ChevronUp, CheckCircle2 } from "lucide-react";

interface UserOption {
  id: string;
  name: string;
}

function TemplateCategoryBadges({ tasks }: { tasks: ProjectTemplate["tasks"] }) {
  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      const cat = t.category || "General";
      map.set(cat, (map.get(cat) || 0) + 1);
    }
    return Array.from(map.entries());
  }, [tasks]);

  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {categories.map(([cat, count]) => (
        <span
          key={cat}
          className="inline-flex items-center px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600"
        >
          {cat} ({count})
        </span>
      ))}
    </div>
  );
}

function TemplateTaskPreview({ template }: { template: ProjectTemplate }) {
  const [expanded, setExpanded] = useState(false);

  // Group tasks by category
  const grouped = useMemo(() => {
    const map = new Map<string, typeof template.tasks>();
    for (const t of template.tasks) {
      const cat = t.category || "General";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(t);
    }
    return Array.from(map.entries());
  }, [template.tasks]);

  const totalDays = Math.max(...template.tasks.map((t) => t.defaultDays || 0));

  return (
    <div className="bg-gray-50 rounded-lg p-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-gray-500 uppercase tracking-wider">
          {template.tasks.length} tasks over {totalDays} days
        </p>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[#004E64] font-medium flex items-center gap-0.5 hover:underline"
        >
          {expanded ? "Collapse" : "View all"}
          {expanded ? (
            <ChevronUp className="w-3 h-3" />
          ) : (
            <ChevronDown className="w-3 h-3" />
          )}
        </button>
      </div>

      <div
        className={`mt-2 space-y-3 overflow-y-auto transition-all ${
          expanded ? "max-h-60" : "max-h-28"
        }`}
      >
        {grouped.map(([category, tasks]) => (
          <div key={category}>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1">
              {category}
            </p>
            <div className="space-y-0.5">
              {tasks.map((t, i) => (
                <p key={t.id} className="text-xs text-gray-600 flex items-start gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-gray-300 mt-0.5 flex-shrink-0" />
                  <span className="flex-1">
                    {t.title}
                    {t.defaultDays != null && (
                      <span className="text-gray-400"> (day {t.defaultDays})</span>
                    )}
                  </span>
                </p>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function CreateProjectModal({
  open,
  onClose,
  defaultServiceId,
  preselectedTemplateId,
}: {
  open: boolean;
  onClose: () => void;
  defaultServiceId?: string;
  preselectedTemplateId?: string;
}) {
  const createProject = useCreateProject();
  const { data: templates } = useProjectTemplates();
  const { data: services } = useServices();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [serviceId, setServiceId] = useState(defaultServiceId || "");
  const [templateId, setTemplateId] = useState(preselectedTemplateId || "");
  const [ownerId, setOwnerId] = useState("");
  const [startDate, setStartDate] = useState(
    new Date().toISOString().split("T")[0]
  );
  const [targetDate, setTargetDate] = useState("");
  const [error, setError] = useState("");

  const { data: users } = useQuery<UserOption[]>({
    queryKey: ["users-list"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const selectedTemplate = templates?.find((t) => t.id === templateId);

  // Sort templates: "Centre Launch" featured first, then alphabetically
  const sortedTemplates = useMemo(() => {
    if (!templates) return [];
    return [...templates].sort((a, b) => {
      const aFeatured = a.name.toLowerCase().includes("launch") ? -1 : 0;
      const bFeatured = b.name.toLowerCase().includes("launch") ? -1 : 0;
      if (aFeatured !== bFeatured) return aFeatured - bFeatured;
      return a.name.localeCompare(b.name);
    });
  }, [templates]);

  // Auto-select preselected template on first render
  const [didAutoSelect, setDidAutoSelect] = useState(false);
  if (preselectedTemplateId && !didAutoSelect && templates?.length) {
    const tpl = templates.find((t) => t.id === preselectedTemplateId);
    if (tpl) {
      setTemplateId(tpl.id);
      setName(tpl.name);
      setDescription(tpl.description || "");
      setDidAutoSelect(true);
    }
  }

  if (!open) return null;

  const handleSelectTemplate = (t: ProjectTemplate) => {
    if (t.id === templateId) {
      setTemplateId("");
      setName("");
      setDescription("");
    } else {
      setTemplateId(t.id);
      setName(t.name);
      setDescription(t.description || "");
      // Auto-set target date based on max defaultDays
      const maxDays = Math.max(...t.tasks.map((task) => task.defaultDays || 0));
      if (maxDays > 0) {
        const target = new Date();
        target.setDate(target.getDate() + maxDays);
        setTargetDate(target.toISOString().split("T")[0]);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!ownerId) {
      setError("Please select a project owner");
      return;
    }

    createProject.mutate(
      {
        name: name || selectedTemplate?.name || "New Project",
        description: description || selectedTemplate?.description || undefined,
        serviceId: serviceId || null,
        templateId: templateId || null,
        ownerId,
        startDate: startDate || null,
        targetDate: targetDate || null,
      },
      {
        onSuccess: () => {
          setName("");
          setDescription("");
          setServiceId("");
          setTemplateId("");
          setOwnerId("");
          setTargetDate("");
          setDidAutoSelect(false);
          onClose();
        },
        onError: (err: Error) => setError(err.message),
      }
    );
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">
              {preselectedTemplateId ? "Launch from Template" : "Create New Project"}
            </h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {preselectedTemplateId
                ? "Configure your project launch"
                : "Optionally start from a template"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Template Selector */}
          {sortedTemplates.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Template{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <div className="space-y-2">
                {sortedTemplates.map((t) => {
                  const isFeatured = t.name.toLowerCase().includes("launch");
                  const isSelected = templateId === t.id;

                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => handleSelectTemplate(t)}
                      className={`w-full flex items-start gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? isFeatured
                            ? "border-[#004E64] bg-[#004E64]/5 ring-1 ring-[#004E64]/20"
                            : "border-[#004E64] bg-[#004E64]/5"
                          : isFeatured
                            ? "border-[#004E64]/30 bg-[#004E64]/[0.02] hover:border-[#004E64]/50"
                            : "border-gray-200 hover:border-gray-300"
                      }`}
                    >
                      {isFeatured ? (
                        <Rocket
                          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                            isSelected ? "text-[#004E64]" : "text-[#004E64]/60"
                          }`}
                        />
                      ) : (
                        <FileText
                          className={`w-5 h-5 mt-0.5 flex-shrink-0 ${
                            isSelected ? "text-[#004E64]" : "text-gray-400"
                          }`}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900">
                            {t.name}
                          </p>
                          {isFeatured && (
                            <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-[#004E64] text-white">
                              FEATURED
                            </span>
                          )}
                        </div>
                        {t.description && (
                          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                            {t.description}
                          </p>
                        )}
                        <TemplateCategoryBadges tasks={t.tasks} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Project Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              placeholder="e.g., Lakemba Centre Opening"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Description{" "}
              <span className="text-gray-400 font-normal">(optional)</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Centre{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="">No linked centre</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Project Owner
              </label>
              <select
                required
                value={ownerId}
                onChange={(e) => setOwnerId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              >
                <option value="">Select owner...</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Start Date
              </label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Target Date{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#004E64] focus:border-transparent"
              />
            </div>
          </div>

          {/* Template tasks preview (category-grouped) */}
          {selectedTemplate && (
            <TemplateTaskPreview template={selectedTemplate} />
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createProject.isPending}
              className="flex-1 px-4 py-2 bg-[#004E64] text-white font-medium rounded-lg hover:bg-[#003D52] transition-colors disabled:opacity-50"
            >
              {createProject.isPending
                ? "Creating..."
                : selectedTemplate
                  ? `Launch with ${selectedTemplate.tasks.length} Tasks`
                  : "Create Project"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
